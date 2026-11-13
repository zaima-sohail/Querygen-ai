# QueryGen AI — AI-Powered Text-to-SQL Generator

QueryGen AI is a full-stack web application that converts natural-language questions into PostgreSQL queries using OpenAI. Users can upload CSV files, import their data into Neon PostgreSQL, generate SQL queries using AI, execute queries, view results, and save query history.

---

## 1. Project Overview

QueryGen AI allows users to interact with database data without manually writing SQL queries.

### Main Features

- User authentication with Clerk.
- Natural-language-to-SQL generation using OpenAI.
- CSV file upload and preview.
- CSV data import into Neon PostgreSQL.
- Automatic detection of CSV columns and data types.
- AI-generated PostgreSQL queries.
- SQL query execution against uploaded CSV data.
- Query results displayed in a table.
- Copy and edit generated SQL.
- Query history saved in MongoDB Atlas.
- User-specific CSV database tables.
- Dark-themed responsive dashboard.

---

## 2. Technology Stack

| Technology | Purpose |
|---|---|
| Next.js 16 | Full-stack application framework |
| React | User interface |
| TypeScript | Type-safe development |
| Tailwind CSS | Dashboard styling |
| OpenAI API | AI-powered SQL generation |
| GPT-4o-mini | Natural-language-to-SQL model |
| Neon PostgreSQL | CSV data storage and SQL execution |
| MongoDB Atlas | Query history storage |
| Clerk | Authentication and user management |
| PapaParse | CSV parsing |
| Node.js | Server-side runtime |
| Vercel | Planned application deployment |

### Application Architecture

QueryGen AI uses a single Next.js application.

There is no separate FastAPI backend.

Next.js Route Handlers provide the backend functionality through API endpoints.

**Architecture flow:**

User → Next.js Dashboard → Next.js API Routes → OpenAI / Neon PostgreSQL / MongoDB Atlas

---

## 3. Project Structure

The main project structure:

```text
querygen-ai/
│
├── app/
│   ├── api/
│   │   ├── generate-sql/
│   │   │   └── route.ts
│   │   │
│   │   ├── execute-sql/
│   │   │   └── route.ts
│   │   │
│   │   ├── csv-import/
│   │   │   └── route.ts
│   │   │
│   │   └── history/
│   │       └── route.ts
│   │
│   ├── page.tsx
│   ├── dashboard-client.tsx
│   ├── layout.tsx
│   ├── sign-in/
│   └── sign-up/
│
├── components/
│   └── CsvUploader.tsx
│
├── lib/
│   ├── mongodb.ts
│   ├── mongodb-dns.ts
│   ├── postgres.ts
│   └── readonly-postgres.ts
│
├── proxy.ts
├── .env.local
├── package.json
└── README.md
```

Note: This is the documented application structure. Additional configuration and component files may also exist in the project.

---

## 4. Installation and Setup

### Prerequisites

Install the following:

- Node.js
- npm
- Visual Studio Code
- Git
- Neon PostgreSQL account
- MongoDB Atlas account
- OpenAI API account
- Clerk account

### Install Dependencies

Open the project directory in VS Code and run:

```bash
npm install
```

Install the required packages if they are not already installed:

```bash
npm install openai pg mongodb papaparse @clerk/nextjs
```

Install TypeScript type definitions:

```bash
npm install -D @types/pg @types/papaparse
```

---

## 5. Environment Variables

Create a `.env.local` file in the project root.

Add the required environment variable names:

```env
OPENAI_API_KEY=your_openai_api_key

DATABASE_URL=your_neon_database_url

READONLY_DATABASE_URL=your_readonly_neon_database_url

MONGODB_URI=your_mongodb_connection_string

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key

CLERK_SECRET_KEY=your_clerk_secret_key

NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in

NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/

NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/
```

**Security notes:**

- Never commit `.env.local` to GitHub.
- Never expose OpenAI API keys.
- Never expose database passwords.
- Never expose Clerk secret keys.
- Keep database credentials in server-side environment variables.
- Use the correct development or production Clerk keys for the environment.

---

## 6. Authentication — Clerk

Clerk provides authentication and user management.

### Authentication Features

- Sign up
- Sign in
- User profile
- Sign out
- Authenticated API requests

The application uses Clerk's `auth()` helper in server-side API routes to identify the currently authenticated user.

Protected API routes should reject unauthenticated requests.

The dashboard UI uses Clerk components such as `Show` and `UserButton`.

Important: Showing or hiding UI based on authentication is not a replacement for server-side API authorization.

---

## 7. Neon PostgreSQL Database

Neon PostgreSQL stores uploaded CSV data and executes generated SQL queries.

### Existing Demo Tables

The initial database setup included:

- `customers`
- `orders`
- `order_items`

These tables contain sample relational database data.

### Read-Only Database Role

A PostgreSQL role named `querygen_reader` was created for read-only query execution.

It is intended to allow SELECT operations without permitting data modification.

The application uses:

- `DATABASE_URL` for database imports.
- `READONLY_DATABASE_URL` for read-only query operations.

The read-only role must have the required SELECT permissions.

---

## 8. CSV Upload and Import

The CSV uploader is implemented in:

```text
components/CsvUploader.tsx
```

PapaParse reads CSV files in the browser.

### CSV Upload Process

1. User selects a CSV file.
2. The browser reads the file.
3. Column headers are detected.
4. The first 10 records are displayed as a preview.
5. The user clicks Import CSV to Neon.
6. The file is sent to the `/api/csv-import` endpoint.
7. The backend parses the CSV.
8. Column names are normalized.
9. Column data types are inferred.
10. A PostgreSQL table is created.
11. CSV records are inserted into Neon.
12. The imported table name is returned to the frontend.

### Current CSV Restrictions

- CSV file only.
- Maximum file size: 4 MB.
- Maximum 50 columns.
- Maximum 20,000 records.
- Column names must be non-empty and unique.
- Empty values are stored as SQL NULL.

### User-Specific CSV Tables

The application generates a unique table name using the authenticated user's ID.

Example:

```text
csv_upload_89ae59f242f0c25e01a7
```

This ensures that different users receive different CSV table names.

**Current limitation:** Each user has one active CSV table. Uploading another CSV replaces that user's previous uploaded CSV table.

---

## 9. OpenAI — Natural Language to SQL

The SQL generation API is:

```text
app/api/generate-sql/route.ts
```

### Generation Process

1. User enters a natural-language question.
2. The frontend sends the question to `/api/generate-sql`.
3. Clerk authentication is checked.
4. The backend identifies the user's CSV table.
5. PostgreSQL schema information is retrieved.
6. The table's actual columns and data types are provided to OpenAI.
7. GPT-4o-mini generates a PostgreSQL SELECT query.
8. The generated SQL is returned to the dashboard.

### Example

User question:

```text
Calculate total sales by country.
```

Generated SQL:

```sql
SELECT country, SUM(total_amount) AS total_sales
FROM "csv_upload_89ae59f242f0c25e01a7"
GROUP BY country
ORDER BY total_sales DESC;
```

The AI is instructed to use only the authenticated user's uploaded CSV table and its available columns.

If a question cannot be answered using the available columns, the API returns an error.

---

## 10. SQL Query Execution

The SQL execution API is:

```text
app/api/execute-sql/route.ts
```

### Execution Process

1. User reviews the generated SQL.
2. User can edit the SQL if required.
3. User clicks Run Query.
4. The API verifies Clerk authentication.
5. The query is validated.
6. The user's CSV table reference is checked.
7. The query runs using the read-only PostgreSQL connection.
8. A read-only database transaction is started.
9. A statement timeout is applied.
10. A maximum of 100 result records is returned.
11. Results are displayed in the dashboard.

### Current SQL Restrictions

The current implementation is designed for single-table SELECT queries.

It does not support:

- INSERT
- UPDATE
- DELETE
- DROP
- ALTER
- CREATE
- Multiple SQL statements
- JOIN queries
- CTE queries
- UNION queries

The current SQL validation uses application-level checks and regular expressions. These checks should not be treated as a complete SQL security boundary. A production version should use robust SQL parsing and strict database permissions.

---

## 11. MongoDB Atlas — Query History

MongoDB Atlas stores users' generated SQL query history.

The history API is:

```text
app/api/history/route.ts
```

The MongoDB connection is managed by:

```text
lib/mongodb.ts
```

### MongoDB Database

Database:

```text
querygen_ai
```

Collection:

```text
query_history
```

### Stored Query Information

Each saved query contains:

```json
{
  "userId": "authenticated_clerk_user_id",
  "question": "Calculate total sales by country",
  "sql": "SELECT country, SUM(total_amount) ...",
  "createdAt": "date"
}
```

### History Features

- Save generated SQL.
- Save the original natural-language question.
- Associate queries with authenticated users.
- Retrieve recent queries.
- Sort queries by creation date.
- Display recent query history on the dashboard.

The API currently retrieves up to 20 recent records per user.

### MongoDB DNS Troubleshooting

If the application displays:

```text
syscall: querySrv
```

Check the MongoDB connection string and DNS configuration.

The project previously encountered an SRV DNS lookup issue with `mongodb+srv://`.

A standard multi-host `mongodb://` connection string was used to work around that issue.

Never share MongoDB credentials publicly.

---

## 12. Dashboard Features

The main dashboard is implemented in:

```text
app/dashboard-client.tsx
```

The server page wrapper is:

```text
app/page.tsx
```

### Dashboard Includes

- Natural-language question input.
- Example questions.
- Generate SQL button.
- Editable SQL editor.
- Copy SQL functionality.
- Run Query button.
- Query results table.
- Loading indicators.
- Error messages.
- Recent query history.
- CSV uploader and preview.
- Analytics section.
- Clerk user profile.

### Dashboard Design

The interface uses a dark navy theme with cyan and purple accents.

Tailwind CSS provides the styling.

---

## 13. API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/generate-sql` | POST | Generate SQL using OpenAI |
| `/api/execute-sql` | POST | Execute read-only SQL |
| `/api/csv-import` | POST | Upload and import CSV |
| `/api/history` | GET | Retrieve query history |
| `/api/history` | POST | Save query history |

All user-specific endpoints should verify authentication and enforce user-level data access.

---

## 14. Running the Application Locally

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

### Basic User Workflow

1. Open the application.
2. Sign in using Clerk.
3. Upload a CSV file.
4. Review the CSV preview.
5. Click Import CSV to Neon.
6. Wait for the import success message.
7. Enter a natural-language question.
8. Click Generate SQL.
9. Review the generated SQL.
10. Click Run Query.
11. View the actual database results.
12. Check the recent query history.

---

## 15. Example Questions for Testing

Use these questions with the sample orders CSV:

```text
Show all customers from Pakistan.

Calculate total sales by country.

Show the top 5 products by revenue.

Calculate total revenue.

Find customers who purchased headphones.

Show the total quantity sold for each product.

Find orders with a total amount greater than 100.

Show the number of orders from each country.
```

The generated SQL should use the actual columns available in the uploaded CSV.

---

## 16. Testing and Troubleshooting

### SQL Generation Fails

Check:

- OpenAI API key.
- User authentication.
- Uploaded CSV table existence.
- Database connection.
- Actual CSV column names.

### SQL Execution Fails

Check:

- Generated SQL syntax.
- Table name.
- Column names.
- Read-only database permissions.
- PostgreSQL connection.
- Query execution timeout.

### CSV Import Fails

Check:

- File extension.
- File size.
- CSV headers.
- Duplicate columns.
- Database connection.
- `querygen_reader` role and permissions.

### Query History Does Not Save

Check:

- MongoDB connection string.
- MongoDB Atlas network access settings.
- MongoDB DNS configuration.
- Database and collection access.
- Terminal error logs from `/api/history`.

---

## 17. Deployment — Vercel

Vercel deployment is the planned next stage.

### Deployment Steps

1. Push the project to a private GitHub repository.
2. Sign in to Vercel.
3. Import the GitHub repository.
4. Configure environment variables in Vercel.
5. Add OpenAI API credentials.
6. Add Neon PostgreSQL connection strings.
7. Add MongoDB Atlas connection string.
8. Add Clerk production keys.
9. Deploy the application.
10. Configure the production Clerk domain and redirect URLs.
11. Test CSV import.
12. Test SQL generation.
13. Test SQL execution.
14. Test query history.

Do not assume that local `.env.local` values automatically transfer to Vercel. Environment variables must be configured separately in Vercel.

---

## 18. Future Improvements

Potential future features:

- Support multiple CSV uploads per user.
- CSV table selection.
- CSV import management.
- Delete uploaded datasets.
- Excel file support.
- Larger file uploads using object storage.
- SQL query visualization.
- Download results as CSV.
- Query history search.
- Query history deletion.
- Database schema explorer.
- Multiple database connections.
- More advanced SQL support.
- Improved SQL parsing and validation.
- Usage limits and billing.
- Production monitoring and error logging.
- Dashboard analytics based on actual database activity.

---

## 19. Project Status

### Implemented Features

- [x] Next.js full-stack application.
- [x] React and TypeScript dashboard.
- [x] Tailwind CSS styling.
- [x] Clerk authentication.
- [x] OpenAI SQL generation.
- [x] Neon PostgreSQL connection.
- [x] Read-only database role.
- [x] CSV upload and preview.
- [x] CSV import into Neon.
- [x] User-specific CSV table naming.
- [x] SQL query execution.
- [x] Query results display.
- [x] MongoDB Atlas connection.
- [x] Query history saving.
- [x] Query history retrieval.


## 20. Conclusion

QueryGen AI demonstrates how artificial intelligence can simplify database querying.

Users can upload their own CSV data, ask questions in natural language, generate SQL through OpenAI, execute queries against PostgreSQL, and save their query history in MongoDB.

The project combines AI, database management, authentication, and full-stack web development in a single Next.js application.

**Project Name:** QueryGen AI  
**Application Type:** Full-Stack AI-Powered Text-to-SQL Web Application  
**Frontend:** Next.js, React, TypeScript, Tailwind CSS  
**Backend:** Next.js Route Handlers  
**AI Model:** OpenAI GPT-4o-mini  
**Primary Database:** Neon PostgreSQL  
**History Database:** MongoDB Atlas  
**Authentication:** Clerk  
**Planned Hosting:** Vercel
