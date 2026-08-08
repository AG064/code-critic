import express, { type ErrorRequestHandler } from "express";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "600kb", strict: true }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", service: "code-critic", provider: "deepseek" });
  });

  app.use((_request, response) => {
    response.status(404).json({ error: "Route not found." });
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    const status = error instanceof SyntaxError ? 400 : 500;
    const message = status === 400 ? "The request body is not valid JSON." : "The service could not complete the request.";
    response.status(status).json({ error: message });
  };

  app.use(errorHandler);

  return app;
}
