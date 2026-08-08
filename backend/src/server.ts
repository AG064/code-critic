import { createApp } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "3001", 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

createApp().listen(port, "0.0.0.0", () => {
  console.log(`Code Critic backend listening on port ${port}`);
});
