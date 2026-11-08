# Installation Guide (Windows)

## 1. Requirements

- JDK 21.
- Apache CouchDB 3.x.
- Windows PowerShell.
- Git.
- VS Code (recommended).

## 2. CouchDB setup

1. Start CouchDB.
2. Open `http://localhost:5984/_utils`.
3. Sign in with your local CouchDB administrator account.
4. Create database `beauty_shop`.

## 3. Environment setup

At the repository root:

```powershell
Copy-Item backend\.env.example backend\.env
```

Edit `backend/.env` and enter the CouchDB URL, username, password and database. `.env` is intentionally excluded from Git.

Spring Boot does not automatically parse an arbitrary `.env` file. Use the provided script so the variables are loaded into the process environment:

```powershell
.\scripts\run-backend.ps1
```

## 4. Backend build / test

```powershell
cd backend\beautyshop-backend
.\mvnw.cmd clean verify
```

## 5. Frontend

Open `frontend` in VS Code and run `login.html` using Live Server. Use `http://127.0.0.1:5500` or `http://localhost:5500` to match the CORS configuration.

## 6. Create indexes and sample documents

From repository root:

```powershell
.\database\scripts\create-indexes.ps1
.\database\scripts\import-samples.ps1 -WhatIf
.\database\scripts\import-samples.ps1
```

Sample import skips existing IDs beginning with `sample_`.

## 7. Common issues

- **401 from CouchDB:** check username/password in `backend/.env`.
- **Database not found:** create `beauty_shop` in Fauxton.
- **Backend cannot connect:** confirm CouchDB is running and `COUCHDB_URL` is correct.
- **CORS error:** open Frontend through Live Server on port 5500; do not open HTML using `file://`.
- **Java version error:** verify `java -version` reports JDK 21.
