import { Router } from "express";
import bodyParser from "body-parser";
import autopayWebhookHandler from "./autopay";
import { wrapHandler } from "@medusajs/utils";

const route = Router();

export default (app) => {
  app.use("/autopay/hooks", route);

  route.use(bodyParser.raw({ type: "application/xml" }));
  route.post("/", wrapHandler(autopayWebhookHandler));

  return app;
};
