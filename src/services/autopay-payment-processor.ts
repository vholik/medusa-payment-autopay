import {
  AbstractPaymentProcessor,
  Logger,
  PaymentProcessorContext,
  PaymentProcessorError,
  PaymentProcessorSessionResponse,
  PaymentSessionStatus,
} from "@medusajs/medusa";
import { generateUniqueID, hashStringWithSHA256 } from "../utils/hash";
import { convertToDecimalString } from "../utils/price";
import buildApi from "../utils/api";
import { parseXml } from "../utils/xml";
import {
  AutopayConfig,
  AutopayPaymentSessionStatusMap,
  GatewayListResponse,
  InitiatePaymentResponse,
} from "../types";

abstract class AutopayBase extends AbstractPaymentProcessor {
  static identifier = "autopay";

  protected readonly logger: Logger;
  protected readonly $api: ReturnType<typeof buildApi>;
  private readonly settings_: AutopayConfig;

  constructor(container, settings) {
    super(container);

    /**
     * Required Autopay options:
     *  {
     *    general_key: "",
     *    service_id: "",
     *    autopay_url: "",
     *  }
     */
    this.settings_ = settings;
    this.logger = container.logger;
    this.$api = buildApi(settings.autopay_url);
  }

  async capturePayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<Record<string, unknown> | PaymentProcessorError> {
    return paymentSessionData;
  }

  async authorizePayment(
    paymentSessionData: Record<string, unknown>,
    context: Record<string, unknown>
  ): Promise<
    | PaymentProcessorError
    | {
        status: PaymentSessionStatus;
        data: Record<string, unknown>;
      }
  > {
    return {
      status: PaymentSessionStatus.AUTHORIZED,
      data: paymentSessionData,
    };
  }

  async cancelPayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<Record<string, unknown> | PaymentProcessorError> {
    return paymentSessionData;
  }

  private generateAutopayParameters({
    cartId,
    gatewayId,
    total,
    currency,
  }: {
    cartId: string;
    gatewayId?: number;
    total: number;
    currency: string;
  }) {
    const decimalTotal = convertToDecimalString(total);

    const hashContent = gatewayId
      ? `${this.settings_.service_id}|${cartId}|${decimalTotal}|${gatewayId}|${currency}|${this.settings_.general_key}`
      : `${this.settings_.service_id}|${cartId}|${decimalTotal}|${currency}|${this.settings_.general_key}`;

    const hash = hashStringWithSHA256(hashContent);

    const apiUrl = gatewayId
      ? `/payment?ServiceID=${this.settings_.service_id}&OrderID=${cartId}&Amount=${decimalTotal}&GatewayID=${gatewayId}&Currency=${currency}&Hash=${hash}`
      : `/payment?ServiceID=${this.settings_.service_id}&OrderID=${cartId}&Amount=${decimalTotal}&Currency=${currency}&Hash=${hash}`;

    return { hash, apiUrl };
  }

  verifyWebhookHash({
    cartId,
    hash,
    currency,
    total,
    gatewayId,
  }: {
    cartId: string;
    hash: string;
    total: number;
    currency: string;
    gatewayId?: number;
  }) {
    const { hash: generatedHash } = this.generateAutopayParameters({
      cartId,
      gatewayId: gatewayId,
      total: total,
      currency,
    });

    return generatedHash === hash;
  }

  async listGateway(currency: string) {
    const id = generateUniqueID();

    const hash = hashStringWithSHA256(
      `${this.settings_.service_id}|${id}|${currency}|${this.settings_.general_key}`
    );

    const data = await this.$api<GatewayListResponse>(`/gatewayList/v2`, {
      ServiceID: this.settings_.service_id,
      MessageID: id,
      Currencies: currency,
      Hash: hash,
    });

    return data.gatewayList;
  }

  async sendInitialPaymentData({
    cartId,
    gatewayId,
    total,
    currency,
  }: {
    cartId: string;
    total: number;
    gatewayId?: number;
    currency: string;
  }) {
    const { apiUrl } = this.generateAutopayParameters({
      cartId,
      gatewayId,
      total,
      currency,
    });

    const data = await this.$api<string>(apiUrl);

    return parseXml<InitiatePaymentResponse>(data);
  }

  async initiatePayment(
    context: PaymentProcessorContext
  ): Promise<PaymentProcessorError | PaymentProcessorSessionResponse> {
    const {
      currency_code,
      amount,
      resource_id,
      context: cart_context,
    } = context;

    try {
      const autopayResponse = await this.sendInitialPaymentData({
        cartId: resource_id,
        gatewayId: cart_context.gateway_id as number | undefined,
        total: amount,
        currency: currency_code.toUpperCase(),
      });

      const paymentStatus =
        AutopayPaymentSessionStatusMap[
          autopayResponse?.transaction?.status?.content
        ];

      if (paymentStatus === PaymentSessionStatus.PENDING) {
        this.logger.info(
          `Autopay payment with cart id ${context.resource_id} initiated`
        );

        const session_data = {
          status: paymentStatus,
          redirect_url: autopayResponse.transaction.redirecturl.content,
          gateway_id: (cart_context.gateway_id as number | undefined) ?? null,
        };

        return {
          session_data,
        };
      }

      return {
        error: autopayResponse?.transaction?.reason?.content ?? "Unknown error",
        code: "400",
      };
    } catch (error) {
      this.logger.error(`Autopay payment error: ${error.message}`);

      return {
        error: error.message,
        code: "400",
      };
    }
  }

  buildConfirmationXml({
    cartId,
    confirmed,
  }: {
    cartId: string;
    confirmed: boolean;
  }) {
    const confirmation = confirmed ? "CONFIRMED" : "NOTCONFIRMED";
    const hash = hashStringWithSHA256(
      `${this.settings_.service_id}|${cartId}|${confirmation}`
    );

    return `
      <?xml version="1.0" encoding="UTF-8"?>
          <confirmationList>
        <serviceID>${this.settings_.service_id}</serviceID>
        <transactionsConfirmations>
          <transactionConfirmed>
            <orderID>${cartId}</orderID>
            <confirmation>${confirmation}</confirmation>
          </transactionConfirmed>
        </transactionsConfirmations>
        <hash>${hash}</hash>
        </confirmationList>
      `;
  }

  async getPaymentStatus(
    sessionData: Record<string, unknown>
  ): Promise<PaymentSessionStatus> {
    switch (sessionData.status) {
      case PaymentSessionStatus.AUTHORIZED:
        return PaymentSessionStatus.AUTHORIZED;
      case PaymentSessionStatus.PENDING:
        return PaymentSessionStatus.AUTHORIZED;
      default:
        return PaymentSessionStatus.CANCELED;
    }
  }

  async deletePayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<Record<string, unknown> | PaymentProcessorError> {
    return paymentSessionData;
  }

  async refundPayment(
    paymentSessionData: Record<string, unknown>,
    refundAmount: number
  ): Promise<Record<string, unknown> | PaymentProcessorError> {
    return paymentSessionData;
  }
  async retrievePayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<Record<string, unknown> | PaymentProcessorError> {
    return paymentSessionData;
  }

  async updatePayment(
    context: PaymentProcessorContext
  ): Promise<void | PaymentProcessorError | PaymentProcessorSessionResponse> {
    const { amount, paymentSessionData } = context;

    if (amount && paymentSessionData.amount === Math.round(amount)) {
      return;
    }

    return await this.initiatePayment(context);
  }

  async updatePaymentData(
    sessionId: string,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown> | PaymentProcessorError> {
    return data;
  }
}

export default AutopayBase;
