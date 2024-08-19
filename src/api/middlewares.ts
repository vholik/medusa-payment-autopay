import type { MiddlewaresConfig } from "@medusajs/medusa";
import xmlparser from "express-xml-bodyparser";

export const config: MiddlewaresConfig = {
  routes: [
    {
      matcher: "/autopay/hooks*",
      middlewares: [xmlparser()],
    },
  ],
};
