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

export type Comparison = {
  schemaType: "table" | "index" | "procedure" | "function";
  name: string;
  ARemarks?: "missing" | "mismatch";
  BRemarks?: "missing" | "mismatch";
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
    const allTables = new Set([
      ...Object.keys(this.schema.tables),
      ...Object.keys(other.schema.tables),
    ]);

    for (let table of allTables) {
      const thisTable = this.schema.tables[table];
      const otherTable = other.schema.tables[table];
      if (thisTable === undefined || otherTable === undefined) {
        diff.push({
          schemaType: "table",
          name: table,
          ARemarks: thisTable ? undefined : "missing",
          BRemarks: otherTable ? undefined : "missing",
        });
        continue;
      }
      // compare columns
      const allColumns = new Set([
        ...Object.keys(thisTable.columns),
        ...Object.keys(otherTable.columns),
      ]);
      for (let column of allColumns) {
        let mismatched = false;
        const thisColumn = thisTable.columns[column] as Record<any, any>;
        const otherColumn = otherTable.columns[column] as Record<any, any>;
        if (otherColumn === undefined || thisColumn === undefined) {
          diff.push({
            schemaType: "table",
            name: table,
            ARemarks: thisColumn ? undefined : "mismatch",
            BRemarks: otherColumn ? undefined : "mismatch",
          });
          break;
        }
        // compare column props
        const allProps = new Set([
          ...Object.keys(thisColumn),
          ...Object.keys(otherColumn),
        ]);
        for (let prop of allProps) {
          if (thisColumn[prop] !== otherColumn[prop]) {
            diff.push({
              schemaType: "table",
              name: table,
              ARemarks: thisColumn[prop] === undefined ? "missing" : "mismatch",
              BRemarks:
                otherColumn[prop] === undefined ? "missing" : "mismatch",
            });
            mismatched = true;
            break;
          }
        }
        if (mismatched) break;
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

      const thisIndexes = this.schema.indexes[table];
      const otherIndexes = other.schema.indexes[table];
      const allIndexes = new Set([
        ...Object.keys(thisIndexes),
        ...Object.keys(otherIndexes),
      ]);
      // compare all index key
      for (let key_name of allIndexes) {
        if (
          thisIndexes[key_name] === undefined ||
          otherIndexes[key_name] === undefined
        ) {
          diff.push({
            name: `${key_name} -- ${table}`,
            schemaType: "index",
            ARemarks:
              thisIndexes[key_name] === undefined ? "missing" : undefined,
            BRemarks:
              otherIndexes[key_name] === undefined ? "missing" : undefined,
          });
        } else {
          // compare indexed columns
          const allColumns = new Set([
            ...Object.keys(thisIndexes[key_name]),
            ...Object.keys(otherIndexes[key_name]),
          ]);
          for (let column of allColumns) {
            let mismatched = false;
            const thisColumn = thisIndexes[key_name][column] as Record<
              any,
              any
            >;
            const otherColumn = otherIndexes[key_name][column] as Record<
              any,
              any
            >;
            if (thisColumn === undefined || otherColumn === undefined) {
              diff.push({
                name: `${key_name} -- ${table}`,
                schemaType: "index",
                ARemarks: thisColumn === undefined ? "missing" : undefined,
                BRemarks: otherColumn === undefined ? "missing" : undefined,
              });
              break;
            }
            // compare indexed column props
            const allProps = new Set([
              ...Object.keys(thisColumn),
              ...Object.keys(otherColumn),
            ]);
            for (let prop of allProps) {
              if (thisColumn[prop] !== otherColumn[prop]) {
                diff.push({
                  name: `${key_name} -- ${table}`,
                  schemaType: "index",
                  ARemarks: "mismatch",
                  BRemarks: "mismatch",
                });
                mismatched = true;
                break;
              }
            }
            if (mismatched) break;
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
