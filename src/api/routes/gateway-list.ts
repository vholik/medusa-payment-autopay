import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import AutopayPaymentProcessor from "../../services/autopay-payment-processor";

export default async (req: MedusaRequest, res: MedusaResponse) => {
  const paymentProvider = req.scope.resolve(
    "autopayPaymentProcessorService"
  ) as AutopayPaymentProcessor;

  const { id } = req.params;

  const gatewayList = await paymentProvider.listGateway(id);

  res.json({ gatewayList });
};
