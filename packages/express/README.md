# @seamless-auth/server-express

Drop-in Express adapter for Seamless Auth “server mode” authentication.

```js
import express from "express";
import createSeamlessAuthServer from "@seamless-auth/server-express";

const app = express();
app.use("/auth", createSeamlessAuthServer({
  authServerUrl: process.env.AUTH_SERVER_URL,
  cookieDomain: ".myapp.com"
}));
