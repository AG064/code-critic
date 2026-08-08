# Code Critic

Code Critic is a browser application for reviewing 100 to 500 lines of source code. It provides Quality and Security analysis through DeepSeek and keeps each request independent.

## Setup

Docker is the only required dependency.

1. Copy `.env.example` to `.env`.
2. Add a DeepSeek API key to `DEEPSEEK_API_KEY` in `.env`.
3. Build and start the application:

   ```sh
   docker compose up --build
   ```

4. Open `http://localhost:27350`.

The health endpoint is available at `http://localhost:27351/health`.

## Usage

Paste source code or choose a source file, select an analysis type, adjust its parameters, and start the review. The generated report can be checked and edited before export.

## Additional features

- Container health checks
- No accounts, sessions, database, or persistent code storage
- Plain text, Markdown, and HTML report exports
