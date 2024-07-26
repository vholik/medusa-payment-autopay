import { PaymentSessionStatus } from "@medusajs/medusa";

export type InitiatePaymentResponse = {
  orderID: { content: string };
  transaction: {
    status: { content: "PENDING" };
    redirecturl: { content: string };
    reason: { content: string };
  };
};

export type AutopayConfig = {
  general_key: string;
  service_id: string;
  autopay_url: string;
};

export const AutopayPaymentSessionStatusMap = {
  SUCCESS: PaymentSessionStatus.AUTHORIZED,
  PENDING: PaymentSessionStatus.PENDING,
  FAILURE: PaymentSessionStatus.CANCELED,
};

export type GatewayListResponse = {
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

export type WebhoookResponse = {
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

export const DEFAULT_CURRENCY = "PLN";
