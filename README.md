### RDBDiff

A tool to compare database schema.

#### 📋 **TODO: Comparison Features to Implement**

- MySql
  - ✅ Tables
  - ✅ Indexes
  - ⬛ Stored Procedures
  - ⬛ Functions

### Usage

```sh
rdbdiff compare mysql://user:pass@host1:port/dbname mysql://user:pass@host2:port/dbname
```

#### 📋 **Dev Environment**

Spin up Containers

```sh
docker-compose up -d
```

Rebuild and Link the Package CLI

```sh
npm i
npm run build
npm run test
npm link .
```

Unlink the Project

```sh
npm unlink @reke592/rdbdiff -g
```
