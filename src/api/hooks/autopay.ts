import {
  MedusaRequest,
  MedusaResponse,
  OrderService,
  PaymentSessionStatus,
} from "@medusajs/medusa";
import { parseXml } from "../../utils/xml";
import AutopayPaymentProcessor from "../../services/autopay-payment-processor";
import { Logger } from "@tanstack/react-query";
import { AutopayPaymentSessionStatusMap } from "../../types";

export default async (req: MedusaRequest, res: MedusaResponse) => {
  const autopayPaymentProcessor = req.scope.resolve(
    "autopayPaymentProcessorService"
  ) as AutopayPaymentProcessor;
  const orderService = req.scope.resolve("orderService") as OrderService;
  const logger = req.scope.resolve("logger") as Logger;
  const manager = req.scope.resolve("manager");

  const xmlString = Buffer.from(req.body).toString();

  const {
    transactions: {
      transaction: { paymentStatus, orderID },
    },
    hash,
  } = parseXml<WebhoookResponse>(xmlString).transactionList;

  try {
    let status: PaymentSessionStatus =
      AutopayPaymentSessionStatusMap[paymentStatus.content];

    await manager.transaction(async (transactionManager) => {
      switch (status) {
        case PaymentSessionStatus.AUTHORIZED:
          const capturedOrder = await orderService.retrieveByCartId(
            orderID.content
          );

          const verify = autopayPaymentProcessor.verifyWebhookHash({
            cartId: orderID.content,
            currency: capturedOrder.currency_code.toUpperCase(),
            hash: hash.content,
            total: capturedOrder.total,
          });

          if (verify) {
            await orderService
              .withTransaction(transactionManager)
              .capturePayment(capturedOrder.id);
          } else {
            logger.error(
              "Error verifying Autopay webhook hash on cart id " +
                orderID.content
            );
          }

          break;
        case PaymentSessionStatus.CANCELED:
          const canceledOrder = await orderService.retrieveByCartId(
            orderID.content
          );

          await orderService.cancel(canceledOrder.id);

          break;
        default:
          break;
      }
    });

    const response = autopayPaymentProcessor.buildConfirmationXml({
      cartId: orderID.content,
      confirmed: true,
    });

    res.header("Content-Type", "application/xml").send(response);
  } catch (error) {
    logger.error("Error capturing Autopay webhook: " + error.message);

    const response = autopayPaymentProcessor.buildConfirmationXml({
      cartId: orderID.content,
      confirmed: false,
    });

    res.header("Content-Type", "application/xml").send(response);
  }
};

type WebhoookResponse = {
  transactionList: {
    transactions: {
      transaction: {
        orderID: { content: string };
        remoteID: { content: string };
        amount: { content: string };
        currency: { content: string };
        gatewayID: { content: string };
        paymentDate: { content: string };
        paymentStatus: { content: string };
        paymentStatusDetails: { content: string };
      };
    };
    hash: {
      content: string;
    };
  };
};
