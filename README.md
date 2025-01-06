### SQLDiff

A tool to compare database schema.

#### 📋 **TODO: Comparison Features to Implement**

- MySql
  - ✅ Tables
  - ✅ Indexes
  - ✅ Stored Procedures
  - ⬛ Functions

### Usage

Compare Database

```sh
sqldiff compare mysql://user:pass@host1:port/dbname mysql://user:pass@host2:port/dbname
```

Display Help

```sh
sqldiff help compare
```

#### 📋 **Dev Environment**

Spin up Containers

```sh
docker-compose up -d
```

Rebuild and Link the Package CLI

```sh
npm i
npm run test
npm link .
```

Unlink the Project

```sh
npm unlink -g @reke592/sqldiff -g
```
