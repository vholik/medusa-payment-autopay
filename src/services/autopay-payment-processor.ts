import {
  AbstractPaymentProcessor,
  CartService,
  Logger,
  OrderService,
  PaymentProcessorContext,
  PaymentProcessorError,
  PaymentProcessorSessionResponse,
  PaymentSessionStatus,
} from "@medusajs/medusa";
import { generateUniqueID, hashStringWithSHA256 } from "../utils/hash";
import { convertToDecimalString } from "../utils/price";
import buildApi from "../utils/api";
import { parseXml } from "../utils/xml";

type InitiatePaymentResponse = {
  orderID: { content: string };
  transaction: {
    status: { content: "PENDING" };
    redirecturl: { content: string };
    reason: { content: string };
  };
};

type Settings = {
  general_key: string;
  service_id: string;
  autopay_url: string;
};

type GatewayListResponse = {
  gatewayList: [
    {
      gatewayID: number;
      gatewayName: string;
      gatewayType: string;
      bankName: string;
      iconURL: string;
      state: string;
      stateDate: string;
      gatewayDescription: null | string;
      inBalanceAllowed: boolean;
      currencyList: { currency: string }[];
    }
  ];
};

export const AutopayPaymentSessionStatusMap = {
  SUCCESS: PaymentSessionStatus.AUTHORIZED,
  PENDING: PaymentSessionStatus.PENDING,
  FAILURE: PaymentSessionStatus.CANCELED,
};

class AutopayPaymentProcessor extends AbstractPaymentProcessor {
  static identifier = "autopay";
  protected readonly logger: Logger;
  protected readonly cartService: CartService;
  protected readonly $api: ReturnType<typeof buildApi>;
  protected readonly orderService: OrderService;
  private readonly settings_: Settings;

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
    this.cartService = container.cartService;
    this.orderService = container.orderService;
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

  async getCartCurrency(cartId: string) {
    const cart = await this.cartService.retrieveWithTotals(cartId);

    return cart.region.currency_code.toUpperCase();
  }

  async cancelPayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<Record<string, unknown> | PaymentProcessorError> {
    return paymentSessionData;
  }

  private async generateAutopayParameters({
    cartId,
    gatewayId,
    total,
  }: {
    cartId: string;
    gatewayId?: number;
    total: number;
  }) {
    const decimalTotal = convertToDecimalString(total);
    const currency = await this.getCartCurrency(cartId);

    const hashContent = gatewayId
      ? `${this.settings_.service_id}|${cartId}|${decimalTotal}|${gatewayId}|${currency}|${this.settings_.general_key}`
      : `${this.settings_.service_id}|${cartId}|${decimalTotal}|${currency}|${this.settings_.general_key}`;

    const hash = hashStringWithSHA256(hashContent);

    const apiUrl = gatewayId
      ? `/payment?ServiceID=${this.settings_.service_id}&OrderID=${cartId}&Amount=${decimalTotal}&GatewayID=${gatewayId}&Currency=${currency}&Hash=${hash}`
      : `/payment?ServiceID=${this.settings_.service_id}&OrderID=${cartId}&Amount=${decimalTotal}&Currency=${currency}&Hash=${hash}`;

    return { hash, apiUrl };
  }

  async verifyWebhookHash(cartId: string, hash: string) {
    const cart = await this.cartService.retrieveWithTotals(cartId);
    const gatewayId = cart.context?.gateway_id as number | undefined;

    const { hash: generatedHash } = await this.generateAutopayParameters({
      cartId,
      gatewayId,
      total: cart.total,
    });

    return generatedHash === hash;
  }

  async sendInitialPaymentData({
    cartId,
    gatewayId,
    total,
  }: {
    cartId: string;
    total: number;
    gatewayId?: number;
  }) {
    const { apiUrl } = await this.generateAutopayParameters({
      cartId,
      gatewayId,
      total,
    });

    const data = await this.$api<string>(apiUrl);

    return parseXml<InitiatePaymentResponse>(data);
  }

  async listGateway(cartId: string) {
    const id = generateUniqueID();

    const currency = await this.getCartCurrency(cartId);

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

  async initiatePayment(
    context: PaymentProcessorContext
  ): Promise<PaymentProcessorError | PaymentProcessorSessionResponse> {
    const cart = await this.cartService.retrieve(context.resource_id);

    const gatewayId = cart.context?.gateway_id as number | undefined;

    try {
      const autopayResponse = await this.sendInitialPaymentData({
        cartId: context.resource_id,
        gatewayId,
        total: context.amount,
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
          gateway_id: gatewayId ?? null,
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
  ): Promise<void | PaymentProcessorError | PaymentProcessorSessionResponse> {}

  async updatePaymentData(
    sessionId: string,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown> | PaymentProcessorError> {
    return data;
  }
}

export default AutopayPaymentProcessor;
