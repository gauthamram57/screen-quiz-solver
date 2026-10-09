# Contributing to ScreenQuizSolver

Thank you for your interest in improving ScreenQuizSolver!

## Development Guidelines

1. **Manifest V3 Standards**: Ensure all extension modifications adhere strictly to Chrome Extensions Manifest V3 specifications.
2. **Local Testing**:
   - Verify code syntax:
     ```bash
     npm run check
     ```
   - Execute the unit test suite:
     ```bash
     npm test
     ```
   - Package the distribution bundle:
     ```bash
     npm run package
     ```
3. **Privacy First**: The extension must never introduce third-party telemetry, intermediary tracking servers, or log API keys. All keys must reside exclusively within `chrome.storage.sync`.
4. **Resilience**: API integrations must include fallback mechanisms to ensure uninterrupted operation during rate limits (HTTP 429) or model deprecations (HTTP 404).

## Pull Request Process

1. Fork the repository and create your feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Commit your changes with descriptive commit messages following the Conventional Commits specification (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).
3. Ensure all tests and syntax checks pass before submitting the PR.
