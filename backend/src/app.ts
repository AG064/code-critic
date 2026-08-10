import express, { type ErrorRequestHandler } from "express";
import { InputValidationError, normalizeAnalysisInput } from "./input/InputNormalizer.js";

function hasErrorType(error: unknown, type: string): boolean {
  return typeof error === "object" && error !== null && "type" in error && error.type === type;
}

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "600kb", strict: true }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", service: "code-critic", provider: "deepseek" });
  });

  app.post("/normalize", (request, response, next) => {
    try {
      response.json({ normalized_input: normalizeAnalysisInput(request.body) });
    } catch (error) {
      next(error);
    }
  });

  app.use((_request, response) => {
    response.status(404).json({ error: "Route not found." });
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof InputValidationError) {
      response.status(error.status).json({ error: error.message, code: error.code, field: error.field });
      return;
    }

    if (hasErrorType(error, "entity.too.large")) {
      response.status(413).json({ error: "The request body is too large.", code: "request_too_large" });
      return;
    }

    if (error instanceof SyntaxError || hasErrorType(error, "entity.parse.failed")) {
      response.status(400).json({ error: "The request body is not valid JSON.", code: "invalid_json" });
      return;
    }

    response.status(500).json({ error: "The service could not complete the request.", code: "internal_error" });
  };

  app.use(errorHandler);

  return app;
}
