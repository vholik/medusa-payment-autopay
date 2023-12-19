# Autopay

Receive payments on your Medusa commerce application using Autopay.

[Author website](https://rigby.pl/) | [Checkout implementation docs](https://docs.medusajs.com/modules/carts-and-checkout/storefront/implement-checkout-flow)

## Features

- Authorize payments on orders
- Supported currencies: PLN, EUR, GBP, USD

---

## Prerequisites

- [Medusa backend](https://docs.medusajs.com/development/backend/install) (>= 1.19.0)
- [Autopay account](https://autopay.pl/)

---

## How to Install

1\. Run the following command in the directory of the Medusa backend:

```bash
yarn add medusa-payment-autopay
```

2\. Set the following environment variables in `.env`:

```bash
AUTOPAY_URL=<YOUR_AUTOPAY_URL>
AUTOPAY_GENERAL_KEY=<YOUR_AUTOPAY_GENERAL_KEY>
AUTOPAY_SERVICE_ID=<YOUR_AUTOPAY_SERVICE_ID>
STORE_CORS=<YOUR_STOREFRONT_URL>
```

3\. In `medusa-config.js` add the following at the end of the `plugins` array:

```js
const plugins = [
  // other plugins...
  {
    resolve: `medusa-payment-autopay`,
    options: {
      autopay_url: process.env.AUTOPAY_URL,
      general_key: process.env.AUTOPAY_GENERAL_KEY,
      service_id: process.env.AUTOPAY_SERVICE_ID,
      store_cors: process.env.STORE_CORS,
    },
  },
];
```

---

## Test the Plugin

1\. Run the following command in the directory of the Medusa backend to run the backend:

```bash
npm run start
```

2\. Enable Autopay payment provider and currencies in your Medusa regions (supported currencies are PLN, EUR, GBP, USD). You can refer to [this User Guide](https://docs.medusajs.com/user-guide/regions/providers) to learn how to do that. Alternatively, you can use the [Admin APIs](https://docs.medusajs.com/api/admin#regions_postregionsregionpaymentproviders).

---

## Using on the storefront

1\. (Optional) Retrieve available payment channels (BLIK, Przelewy24 etc.) using `/store/autopay/:id/gateways` (where `id` is a cart id) and update cart `context` field with the gateway_id to choose payment channel on checkout:

```js
await medusa.carts.update(cartId, {
  // other fields like billing_address, shipping_address and email...
  context: {
    gateway_id: gatewayId, // example: 501 (BLIK payment channel)
  },
});
```

2\. After adding required for cart completion fields like `billing_address`, `shipping_address` and `email` you should make a payment sessions, complete a cart and redirect to payment url:

```js
// on submit handler...
await medusa.carts.createPaymentSessions(cartId);

medusa.carts.complete(cartId).then(({ cart }) => {
  const redirectUrl = cart.payment_session.data.redirect_url;

  router.replace(redirectUrl);
});
```

3\. After client succesfuly pay for the order you should see paid order in your Medusa admin dashboard.
