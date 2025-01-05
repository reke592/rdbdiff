import { knex, Knex } from "knex";

export type InformationSchema = {
  tables: {
    [tableName: string]: {
      engine: string;
      columns: {
        [columnName: string]: ColumnInfo;
      };
    };
  };
  indexes: {
    [tableName: string]: {
      [keyName: string]: {
        [columnName: string]: IndexInfo;
      };
    };
  };
};

export type TableInfo = {
  name: string;
  engine: string;
};

export type ColumnInfo = {
  name: string;
  type: string;
  default: string | null;
  nullable: string;
  key: string;
  charMaxLength: number | null;
  ordinalPosition: number;
};

export type IndexInfo = {
  key_name: string;
  isUnique: boolean;
  column: string;
  sequence_no: number;
};

export type SchemaType = "table" | "index" | "procedure" | "function";

export type ComparisonRemarks = "missing" | "mismatch";

export type Comparison = {
  schemaType: SchemaType;
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
};

/**
 * compare schema properties
 * @param schemaType
 * @param A record
 * @param B record
 * @param compareValue flag to compare value
 * @param name static name for comparison, e.g. when comparing table columns, we need the table name instead of the property name being tested.
 * @returns [ diff, nodiffKeys ]
 */
export function compareSchemaObjects(
  schemaType: SchemaType,
  A: Record<any, any>,
  B: Record<any, any>,
  options?: {
    in?: string;
    name?: string;
  }
): [diff: Comparison[], nodiffKeys: Set<string>] {
  const diff: Comparison[] = [];
  const nodiffKeys = new Set<string>();
  const allProps = new Set([...Object.keys(A || {}), ...Object.keys(B || {})]);
  for (let prop of allProps) {
    if (A[prop] === undefined) {
      diff.push({
        schemaType: schemaType,
        name: options?.name || prop,
        in: options?.in,
        A: "missing",
        B: undefined,
      });
    } else if (B[prop] === undefined) {
      diff.push({
        schemaType: schemaType,
        name: options?.name || prop,
        in: options?.in,
        A: undefined,
        B: "missing",
      });
    } else if (
      typeof A[prop] !== "object" &&
      typeof B[prop] !== "object" &&
      A[prop] !== B[prop]
    ) {
      diff.push({
        schemaType: schemaType,
        name: options?.name || prop,
        in: options?.in,
        A: "mismatch",
        B: "mismatch",
      });
      break;
    } else {
      nodiffKeys.add(prop);
    }
  }
  return [diff, nodiffKeys];
}

export abstract class Diff {
  private _connection: Knex;
  private _label: string;

  protected schema: InformationSchema = {
    tables: {},
    indexes: {},
  };

  protected dbname: string;

  constructor(options: ConnectionOptions) {
    let { host, port, database } = options;
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

  log(...message: any) {
    console.log(this._label, ...message);
  }

  /**
   * load schema
   */
  async load(): Promise<InformationSchema> {
    // set initial value
    this.schema = {
      tables: {},
      indexes: {},
    };

    this.log("checking schema..");
    const tables = await this.getTables();

    this.log(`tables in ${this.dbname}: ${tables.length}`);
    for (let table of tables) {
      let columns = await this.getColumns(table.name).then((rows) =>
        rows.reduce((data: Record<string, ColumnInfo>, row) => {
          data[row.name] = row;
          return data;
        }, {})
      );
      let indexes = await this.getIndexes(table.name).then((results) =>
        results.reduce(
          (data: Record<string, Record<string, IndexInfo>>, row) => {
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
      this.log(
        `'${table.name}'`,
        `columns: ${Object.keys(columns).length}`,
        `index: ${Object.keys(indexes).length}`
      );
    }

    this.log(`closing connection..`);
    this._connection.destroy();
    return this.schema;
  }

  json(pretty: boolean = true) {
    return pretty
      ? JSON.stringify({ label: this._label, schema: this.schema }, null, 2)
      : JSON.stringify({ label: this._label, schema: this.schema });
  }

  /**
   * compare schema to other schema
   * @param other
   * @returns aggregated list of comparisons
   */
  compare(other: this): Comparison[] {
    return [...this.compareTables(other), ...this.compareIndex(other)];
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
        "table",
        this.schema.tables[table].columns,
        this.schema.tables[table].columns,
        { name: table }
      );
      if (missingColumns.length) {
        diff.push(...missingColumns);
        continue;
      }

      for (let column of allColumns) {
        const [mismatchedColumns, _] = compareSchemaObjects(
          "table",
          this.schema.tables[table].columns[column],
          other.schema.tables[table].columns[column],
          { name: table }
        );
        if (mismatchedColumns.length) {
          diff.push(...mismatchedColumns);
          break;
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
          { name: key_name, in: table }
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
            { name: key_name, in: table }
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

  abstract getTables(): Promise<TableInfo[]>;
  abstract getColumns(tableName: string): Promise<ColumnInfo[]>;
  abstract getIndexes(tableName: string): Promise<IndexInfo[]>;
}
