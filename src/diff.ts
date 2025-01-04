import debug from "debug";
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

export type Difference = {
  schemaType: "table" | "column";
  remarks: "missing" | "mismatch";
  table: string;
  name: string;
};

export type Comparison = {
  schemaType: "table" | "procedure" | "function";
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

  log(message: any) {
    console.log(this._label, message);
  }

  /**
   * load schema
   */
  async load(): Promise<InformationSchema> {
    // set initial value
    this.schema = {
      tables: {},
    };

    this.log("checking schema..");
    const tables = await this.getTables();

    this.log(`total tables: ${tables.length}`);
    for (let table of tables) {
      let columns = await this.getColumns(table.name).then((rows) =>
        rows.reduce((data: Record<string, ColumnInfo>, row) => {
          data[row.name] = row;
          return data;
        }, {})
      );
      this.schema.tables[table.name] = {
        engine: table.engine,
        columns: columns,
      };
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
    return [...this.compareTables(other)];
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
            break;
          }
        }
      }
    }

    return diff;
  }

  abstract getTables(): Promise<TableInfo[]>;
  abstract getColumns(tableName: string): Promise<ColumnInfo[]>;
  abstract testConnection(): Promise<any>;
}
