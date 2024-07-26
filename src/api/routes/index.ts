import { Router } from "express";
import { wrapHandler } from "@medusajs/utils";
import gatewayList from "./gateway-list";
import cors from "cors";

const route = Router();

export default (app, options) => {
  app.use("/", route);

  route.options("/store/autopay/gateways", cors(options.storeCors));
  route.get(
    "/store/autopay/gateways",
    cors(options.storeCors),
    wrapHandler(gatewayList)
  );

  return app;
};
