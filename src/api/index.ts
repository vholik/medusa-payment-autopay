import { Router } from "express";
import hooks from "./hooks";
import routes from "./routes";

export default (_, options) => {
  const app = Router();

  const storeCors = {
    // origin: options.store_cors.split(","),
    // credentials: true,
  };

  hooks(app);
  routes(app, { storeCors });

  return app;
};
