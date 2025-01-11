### SQLDiff Schema

A tool to compare database schema. Exit code 1 if the schema does not match.

**Sample Use Case:** To fail a pipeline.

#### 📋 **TODO: Comparison Features to Implement**

- MySql

  - ✅ Tables
  - ✅ Indexes
  - ✅ Stored Procedures
  - ✅ Functions

#### 📋 **TODO: CLI Output to Implement**

- CLI Output
  - ✅ Console.table
  - ✅ Show Create
  - ⬛ Show Fix

### Usage

Compare Database

```sh
sqldiff compare mysql://user:pass@host1:port/dbname mysql://user:pass@host2:port/dbname
```

Display Help

```sh
sqldiff help compare
```

### Running As Docker Container

```sh
# build the image
docker build . -t sqldiff

# run the container
docker run --rm sqldiff compare mysql://user:pass@host1:port/dbname mysql://user:pass@host2:port/dbname

# save console logs to a file
docker run --rm sqldiff compare mysql://user:pass@host1:port/dbname mysql://user:pass@host2:port/dbname > out.log 2>&1
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
npm unlink -g @reke592/sqldiff
```
