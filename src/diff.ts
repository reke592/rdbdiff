import { knex, Knex } from "knex";

export type InformationSchema = {
  tables: {
    [tableName: string]: {
      engine: string;
      columns: {
        [columnName: string]: Record<string, any>;
      };
    };
  };
  indexes: {
    [tableName: string]: {
      [keyName: string]: {
        [columnName: string]: Record<string, any>;
      };
    };
  };
  procedures: {
    [procName: string]: {
      definition: string;
      parameters: {
        [paramName: string]: Record<string, any>;
      };
    };
  };
  functions: {
    [procName: string]: {
      definition: string;
      parameters: {
        [paramName: string]: Record<string, any>;
      };
    };
  };
  summary: {
    tables: {
      [tableName: string]: {
        columns: number;
        indexes: number;
      };
    };
    procedures: {
      [procName: string]: {
        parameters: number;
      };
    };
    functions: {
      [fnName: string]: {
        parameters: number;
      };
    };
  };
};

export type ObjectType =
  | "table"
  | "table.column"
  | "index"
  | "procedure"
  | "procedure.parameter"
  | "function"
  | "function.parameter";

export type ComparisonRemarks = "exist" | "missing" | "mismatch";

export type Comparison = {
  objectType: ObjectType;
  name: string;
  in?: string;
  A?: ComparisonRemarks;
  B?: ComparisonRemarks;
};

export type ConnectionOptions = {
  client: string;
  database: string;
  filename?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  options: ComparisonOptions;
};

export type ComparisonOptions = {
  /**
   * check all errors in schema object
   */
  eager: boolean;
  /**
   * logs connection activity
   */
  verbose: boolean;
  /**
   * check whitespace in procedure and function definitions
   */
  whitespaces: boolean;
};

/**
 * compare schema properties
 * @param objectType
 * @param A record
 * @param B record
 * @param compareValue flag to compare value
 * @param options e.g. when comparing table columns, we need the table name instead of the property name being tested.
 * @returns [ diff, nodiffKeys ]
 */
export function compareSchemaObjects(
  objectType: ObjectType,
  _A: Record<any, any>,
  _B: Record<any, any>,
  options?: {
    /**
     * the owner of schema object.
     *
     * e.g. the name of table when checking a table columns or indexes
     */
    in?: string;
    /**
     * the name of schema object.
     *
     * e.g. a table | index | stored_procedure | function name
     */
    name?: string;
    /**
     * static remarks to use
     *
     * e.g. index name 'ix' exist in A.table and B.table but refereces different column
     */
    remarks?: ComparisonRemarks;
    /**
     * check whitespaces when comparing
     */
    whitespaces?: boolean;
  }
): [diff: Comparison[], nodiffKeys: Set<string>] {
  const diff: Comparison[] = [];
  const nodiffKeys = new Set<string>();
  const A = _A || {};
  const B = _B || {};
  const allProps = new Set([...Object.keys(A), ...Object.keys(B)]);
  for (let prop of allProps) {
    const valueA =
      typeof A[prop] === "string" && options?.whitespaces == false
        ? A[prop].replace(/([\s]{2,}|\t|\n)/g, " ")
        : A[prop];
    const valueB =
      typeof B[prop] === "string" && options?.whitespaces == false
        ? B[prop].replace(/([\s]{2,}|\t|\n)/g, " ")
        : B[prop];
    if (valueA === undefined) {
      diff.push({
        objectType: objectType,
        name: options?.name || prop,
        in: options?.in,
        A: options?.remarks || "missing",
        B: options?.remarks || "exist",
      });
    } else if (valueB === undefined) {
      diff.push({
        objectType: objectType,
        name: options?.name || prop,
        in: options?.in,
        A: options?.remarks || "exist",
        B: options?.remarks || "missing",
      });
    } else if (
      typeof valueA !== "object" &&
      typeof valueB !== "object" &&
      valueA !== valueB
    ) {
      diff.push({
        objectType: objectType,
        name: options?.name || prop,
        in: options?.in,
        A: "mismatch",
        B: "mismatch",
      });
    } else {
      nodiffKeys.add(prop);
    }
    // options.name is given when checking for components of a schema object. e.g. table.columns
    // stop checking the other properties once we determined the difference between schema object A and B.
    // to avoid duplicate comparison results
    if (options?.name && diff.length) {
      break;
    }
  }

  return [diff, nodiffKeys];
}

export abstract class Diff {
  private _connection: Knex;
  private _label: string;
  private comparisonOptions: ComparisonOptions;

  protected schema: InformationSchema = {
    tables: {},
    indexes: {},
    procedures: {},
    functions: {},
    summary: {
      tables: {},
      procedures: {},
      functions: {},
    },
  };

  protected dbname: string;

  constructor(options: ConnectionOptions) {
    let { host, port, database } = options;
    this.comparisonOptions = options.options;
    this._label = `${host}${port ? `_${port}` : ""}_${database}`;
    this.dbname = options.database;
    this._connection = knex({
      client: options.client,
      connection: {
        filename: options.filename,
        database: options.database,
        host: options.host,
        port: options.port,
        user: options.user,
        password: options.password,
      },
    });
  }

  /**
   * execute raw sql
   * @param sql
   * @param binding parameters
   * @returns array results
   */
  async raw(sql: string, binding: knex.Knex.RawBinding = []): Promise<any[]> {
    let query = this._connection.raw(sql, binding);
    let [result, fields] = await query;
    return result;
  }

  async disconnect(): Promise<void> {
    this.log(`closing connection..`);
    await this._connection.destroy();
  }

  log(...message: any) {
    if (this.comparisonOptions.verbose) {
      console.log(this._label, ...message);
    }
  }

  /**
   * load schema
   */
  async load(): Promise<InformationSchema> {
    this.log("checking table schema..");
    // TABLES and INDEXES
    const tables = await this.getTables();
    this.log(`tables in ${this.dbname}: ${tables.length}`);
    for (let table of tables) {
      let columns = await this.getColumns(table.name).then((rows) =>
        rows.reduce((data: Record<string, Record<string, any>>, row) => {
          data[row.name] = row;
          return data;
        }, {})
      );
      let indexes = await this.getIndexes(table.name).then((results) =>
        results.reduce(
          (data: Record<string, Record<string, Record<string, any>>>, row) => {
            data[row.key_name] = data[row.key_name] || {};
            data[row.key_name][row.column] = row;
            return data;
          },
          {}
        )
      );
      this.schema.tables[table.name] = {
        engine: table.engine,
        columns: columns,
      };
      this.schema.indexes[table.name] = indexes;
      this.schema.summary.tables[table.name] = {
        columns: Object.keys(columns).length,
        indexes: Object.keys(indexes).length,
      };
      this.log(
        `'${table.name}'`,
        `columns: ${this.schema.summary.tables[table.name].columns}`,
        `index: ${this.schema.summary.tables[table.name].indexes}`
      );
    }

    // STORED PROCEDURES
    this.log("checking routines..");
    const procedures = await this.getStoredProcedures();
    this.log(`stored procedures in ${this.dbname}: ${procedures.length}`);
    for (let proc of procedures) {
      let params = await this.getStoredProcParams(proc.name);
      this.schema.procedures[proc.name] = {
        definition: proc.definition,
        parameters: params.reduce(
          (data: Record<string, Record<string, any>>, row) => {
            data[row.name] = row;
            return data;
          },
          {}
        ),
      };
      this.schema.summary.procedures[proc.name] = { parameters: params.length };
      this.log(`${proc.name} params: ${params.length}`);
    }
    // FUNCTIONS
    const functions = await this.getFunctions();
    this.log(`functions in ${this.dbname}: ${functions.length}`);
    for (let proc of functions) {
      let params = await this.getFunctionParams(proc.name);
      this.schema.functions[proc.name] = {
        definition: proc.definition,
        parameters: params.reduce(
          (data: Record<string, Record<string, any>>, row) => {
            data[row.name] = row;
            return data;
          },
          {}
        ),
      };
      this.schema.summary.functions[proc.name] = { parameters: params.length };
      this.log(`${proc.name} params: ${params.length}`);
    }

    return this.schema;
  }

  asRecord() {
    return { label: this._label, schema: this.schema };
  }

  /**
   * compare schema to other schema
   * @param other
   * @returns aggregated list of comparisons
   */
  compare(other: this): Comparison[] {
    return [
      ...this.compareTables(other),
      ...this.compareIndex(other),
      ...this.compareProcedures(other),
      ...this.compareFunctions(other),
    ];
  }

  /**
   * compare tables
   * @param other
   * @returns list of comparisons
   */
  compareTables(other: this): Comparison[] {
    const diff: Comparison[] = [];
    // check missing
    const [missingTable, allTables] = compareSchemaObjects(
      "table",
      this.schema.tables,
      other.schema.tables
    );
    diff.push(...missingTable);

    for (let table of allTables) {
      const [missingColumns, allColumns] = compareSchemaObjects(
        "table.column",
        this.schema.tables[table].columns,
        this.schema.tables[table].columns,
        { in: table }
      );
      if (missingColumns.length) {
        diff.push(...missingColumns);
        if (!this.comparisonOptions.eager) {
          continue;
        }
      }

      for (let column of allColumns) {
        const [mismatchedColumns, _] = compareSchemaObjects(
          "table.column",
          this.schema.tables[table].columns[column],
          other.schema.tables[table].columns[column],
          { name: column, in: table }
        );
        if (mismatchedColumns.length) {
          diff.push(...mismatchedColumns);
          if (!this.comparisonOptions.eager) {
            break;
          }
        }
      }
    }

    return diff;
  }

  compareIndex(other: this): Comparison[] {
    const diff: Comparison[] = [];
    const allTables = new Set([
      ...Object.keys(this.schema.tables),
      ...Object.keys(other.schema.tables),
    ]);
    // compare all index in all table
    for (let table of allTables) {
      // skip comparing index if the table does not exist in database
      if (
        this.schema.tables[table] === undefined ||
        other.schema.tables[table] === undefined
      ) {
        continue;
      }

      const [missingIndexes, allIndexes] = compareSchemaObjects(
        "index",
        this.schema.indexes[table],
        other.schema.indexes[table],
        { in: table }
      );
      if (missingIndexes.length) {
        diff.push(...missingIndexes);
        continue;
      }

      for (let key_name of allIndexes) {
        const [missingColumns, allColumns] = compareSchemaObjects(
          "index",
          this.schema.indexes[table][key_name],
          other.schema.indexes[table][key_name],
          { name: key_name, in: table, remarks: "mismatch" }
        );
        if (missingColumns.length) {
          diff.push(...missingColumns);
          break;
        }

        for (let column of allColumns) {
          const [mismatchedColumns, _] = compareSchemaObjects(
            "index",
            this.schema.indexes[table][key_name][column],
            other.schema.indexes[table][key_name][column],
            { name: key_name, in: table, remarks: "mismatch" }
          );
          if (mismatchedColumns.length) {
            diff.push(...mismatchedColumns);
            break;
          }
        }
      }
    }
    return diff;
  }

  compareProcedures(other: this): Comparison[] {
    const diff: Comparison[] = [];
    const [missing, allStoredProcs] = compareSchemaObjects(
      "procedure",
      this.schema.procedures,
      other.schema.procedures
    );
    diff.push(...missing);

    for (let procName of allStoredProcs) {
      const thisProc = this.schema.procedures[procName];
      const otherProc = other.schema.procedures[procName];

      // compare body
      const [mistmatchBody, _] = compareSchemaObjects(
        "procedure",
        thisProc,
        otherProc,
        {
          name: procName,
          in: "definition",
          whitespaces: this.comparisonOptions.whitespaces,
        }
      );
      if (mistmatchBody.length) {
        diff.push(...mistmatchBody);
      }

      // compare parameters
      const [missingParams, allParams] = compareSchemaObjects(
        "procedure.parameter",
        thisProc.parameters,
        otherProc.parameters,
        { in: procName }
      );
      if (missingParams.length) {
        diff.push(...missingParams);
        if (!this.comparisonOptions.eager) {
          continue;
        }
      }

      for (let paramName of allParams) {
        const [mismatchParams, _] = compareSchemaObjects(
          "procedure.parameter",
          thisProc.parameters[paramName],
          otherProc.parameters[paramName],
          { name: paramName, in: procName, remarks: "mismatch" }
        );
        if (mismatchParams.length) {
          diff.push(...mismatchParams);
          if (!this.comparisonOptions.eager) {
            break;
          }
        }
      }
    }
    return diff;
  }

  compareFunctions(other: this): Comparison[] {
    const diff: Comparison[] = [];
    const [missing, allStoredProcs] = compareSchemaObjects(
      "function",
      this.schema.functions,
      other.schema.functions
    );
    diff.push(...missing);

    for (let fnName of allStoredProcs) {
      const thisProc = this.schema.functions[fnName];
      const otherProc = other.schema.functions[fnName];

      // compare body
      const [mistmatchBody, _] = compareSchemaObjects(
        "function",
        thisProc,
        otherProc,
        {
          name: fnName,
          in: "definition",
          whitespaces: this.comparisonOptions.whitespaces,
        }
      );
      if (mistmatchBody.length) {
        diff.push(...mistmatchBody);
      }

      // compare parameters
      const [missingParams, allParams] = compareSchemaObjects(
        "function.parameter",
        thisProc.parameters,
        otherProc.parameters,
        { in: fnName }
      );
      if (missingParams.length) {
        diff.push(...missingParams);
        if (!this.comparisonOptions.eager) {
          continue;
        }
      }
      for (let paramName of allParams) {
        const [mismatchParams, _] = compareSchemaObjects(
          "function.parameter",
          thisProc.parameters[paramName],
          otherProc.parameters[paramName],
          { name: paramName, in: fnName, remarks: "mismatch" }
        );
        if (mismatchParams.length) {
          diff.push(...mismatchParams);
          if (!this.comparisonOptions.eager) {
            break;
          }
        }
      }
    }
    return diff;
  }

  abstract getTables(): Promise<Record<string, any>[]>;
  abstract getColumns(tableName: string): Promise<Record<string, any>[]>;
  abstract getIndexes(tableName: string): Promise<Record<string, any>[]>;
  abstract getStoredProcedures(): Promise<Record<string, any>[]>;
  abstract getStoredProcParams(spName: string): Promise<Record<string, any>[]>;
  abstract getFunctions(): Promise<Record<string, any>[]>;
  abstract getFunctionParams(fnName: string): Promise<Record<string, any>[]>;
  abstract showCreate(type: string, name: string): Promise<string | undefined>;
}
