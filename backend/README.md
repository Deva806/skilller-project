# Skiller Backend Documentation

## 1. Overview

Skiller is a course and gig marketplace platform. Its backend provides APIs for authentication, user management, courses, lessons, enrollments, gig applications, payments, subscriptions, wallets, withdrawals, and notifications.

## 2. Technology Stack

- Python
- FastAPI
- SQLAlchemy database models and sessions
- PostgreSQL database and Alembic migrations
- JWT-based authentication (verify implementation in the source)
- Email OTP services
- Razorpay payment integration
- Docker Compose for local database services
- Pytest-based backend tests

Refer to `requirements.txt` for the exact Python dependencies.

## 3. Backend Structure

| Path | Purpose |
|---|---|
| `server.py` | Application entry point |
| `core.py` | Core application configuration and shared functionality |
| `routers/` | HTTP API route modules |
| `services/` | Business logic and service functions |
| `models/` | Database models |
| `db/session.py` | Database session management |
| `db/dependencies.py` | Database dependencies |
| `alembic/` | Database migration configuration and revisions |
| `tests/` | Backend test files |
| `scripts/` | Database migration and maintenance scripts |
| `docker-compose.yml` | Local supporting services configuration |
| `requirements.txt` | Python dependencies |
| `runtime.txt` | Runtime version configuration |

## 4. Main API Modules

The following modules organize the backend functionality:

- `routers/auth.py` — authentication
- `routers/users.py` — user-related operations
- `routers/admin.py` — administrative operations
- `routers/courses.py` — courses
- `routers/lessons.py` — lessons
- `routers/enrollments.py` — course enrollments
- `routers/gigs.py` — gigs and applications
- `routers/billing.py` — billing
- `routers/subscriptions.py` — subscriptions
- `routers/wallet.py` and `routers/wallets.py` — wallet operations
- `routers/withdrawals.py` and `routers/admin_withdrawals.py` — withdrawal operations
- `routers/payout_accounts.py` — creator payout accounts
- `routers/notifications.py` — notifications
- `routers/search.py` — search
- `routers/ai.py` — AI-related functionality
- `routers/files.py` — file operations
- `routers/dashboard.py` — dashboard operations

For exact HTTP methods, endpoint paths, request fields, and response schemas, inspect the router source files or the running FastAPI OpenAPI documentation.

## 5. Database

Database models are defined under `models/`. They cover entities such as users, courses, lessons, enrollments, gigs, applications, payment transactions, subscriptions, wallets, wallet ledger entries, withdrawals, payout accounts, and experience events.

Alembic migration revisions are stored in `alembic/versions/`.

Configure the database connection using the environment variables and settings expected by the current backend code. Do not commit database credentials.

## 6. Authentication and OTP

Authentication routes are organized in `routers/auth.py`. OTP-related logic is present in `otp_service.py` and `services/otp_service.py`.

Review these files to confirm the current registration, login, verification, password reset, token expiry, and resend rules. Authentication requirements should be followed when calling protected endpoints.

## 7. Payments and Wallets

Payment and financial business logic is organized in service modules including:

- `services/payment_service.py`
- `services/course_purchase_service.py`
- `services/subscription_service.py`
- `services/wallet_service.py`
- `services/withdrawal_service.py`
- `services/payout_account_service.py`

Payment provider credentials must be configured through environment variables. Use test credentials and sandbox mode when testing payment flows. Never publish real API secrets.

## 8. Local Setup

Run commands from the project root unless otherwise specified.

### Create and activate a virtual environment

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
```

On Windows PowerShell, activate it with:

```powershell
.\venv\Scripts\Activate.ps1
```

### Install dependencies

```bash
pip install -r requirements.txt
```

### Configure environment variables

Create a local `.env` file only if required by the application configuration. Determine the required variable names from `core.py`, `server.py`, `db/session.py`, and the relevant service files.

Configure valid database connection settings and any required authentication, email, payment, storage, or notification credentials. Do not copy real credentials into this documentation or commit `.env` files.

### Start supporting services

Review `docker-compose.yml` before running it:

```bash
docker compose up -d
```

Ensure the required database service is running and the configured database connection is correct.

### Start the API

From the `backend` directory, with the virtual environment active:

```bash
uvicorn server:app --reload
```

If startup fails, check the required environment variables, database availability, installed dependencies, and application logs.

If the application is running locally, FastAPI's interactive API documentation is commonly available at:

- Swagger UI: `http://127.0.0.1:8000/docs`
- OpenAPI schema: `http://127.0.0.1:8000/openapi.json`

These URLs depend on the application's current configuration.

## 9. Database Migrations

Alembic configuration is in `alembic.ini`, with migration scripts under `alembic/versions/`.

Before running migrations, verify the database URL and environment configuration. Follow the project's existing migration workflow and back up important data before applying schema changes.

## 10. Tests

Backend tests are located in `tests/`.

Install the dependencies and configure a suitable test database and test credentials before running tests. A common test command is:

```bash
pytest
```

Check individual test files for required fixtures, services, and external dependencies.

## 11. Security Notes

- Never commit `.env` files, API tokens, passwords, or private keys.
- Do not use production payment credentials in local development.
- Keep authentication secrets private.
- Validate authorization and role permissions for protected routes.
- Do not use real user or payment data in test environments.

## 12. Troubleshooting

- **Import errors:** Activate the virtual environment and install `requirements.txt`.
- **Database connection errors:** Check the database service, connection URL, credentials, and port.
- **Authentication failures:** Review token configuration, OTP expiry, and authentication dependencies.
- **Email failures:** Verify the configured email service credentials.
- **Payment failures:** Confirm sandbox configuration and payment provider credentials.
- **Migration failures:** Check the database URL and migration history before retrying.

## 13. Source Code Reference

Repository: https://github.com/Deva806/skilller-project

This document describes the backend layout and intended development workflow. The source code remains the authoritative reference for the exact implemented API contracts and configuration.
