import express, { type ErrorRequestHandler } from "express";
import { InputValidationError, normalizeAnalysisInput } from "./input/InputNormalizer.js";
import { ReviewError } from "./review/DeepSeekClient.js";
import { reviewQuality, type QualityInput, type QualityReport } from "./review/QualityReview.js";
import { reviewSecurity, type SecurityInput, type SecurityReport } from "./review/SecurityReview.js";

interface AppDependencies {
  reviewQuality?: (input: QualityInput) => Promise<QualityReport>;
  reviewSecurity?: (input: SecurityInput) => Promise<SecurityReport>;
}

function hasErrorType(error: unknown, type: string): boolean {
  return typeof error === "object" && error !== null && "type" in error && error.type === type;
}

export function createApp(dependencies: AppDependencies = {}) {
  const app = express();
  const runQualityReview = dependencies.reviewQuality ?? reviewQuality;
  const runSecurityReview = dependencies.reviewSecurity ?? reviewSecurity;

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

  app.post("/analyze", async (request, response, next) => {
    try {
      const normalizedInput = normalizeAnalysisInput(request.body);
      const report = normalizedInput.analysis_type === "quality"
        ? await runQualityReview(normalizedInput)
        : await runSecurityReview(normalizedInput);
      response.json({ normalized_input: normalizedInput, report });
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

    if (error instanceof ReviewError) {
      response.status(error.status).json({ error: error.message, code: error.code });
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
