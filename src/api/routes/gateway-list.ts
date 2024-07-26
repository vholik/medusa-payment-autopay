import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { DEFAULT_CURRENCY } from "../../types";
import AutopayBase from "../../services/autopay-payment-processor";

export default async (req: MedusaRequest, res: MedusaResponse) => {
  const paymentProvider = req.scope.resolve(
    "autopayPaymentProcessorService"
  ) as AutopayBase;

  const gatewayList = await paymentProvider.listGateway(DEFAULT_CURRENCY);

  res.json({ gatewayList });
};
