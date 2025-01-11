import { ConnectionOptions, Diff, ObjectType } from "./diff";
import { titleCase } from "./utils";

export class MySqlDiff extends Diff {
  constructor(options: ConnectionOptions) {
    super(options);
  }

  async getTables(): Promise<Record<string, any>[]> {
    let results = await this.raw(
      `
      SELECT 
        TABLE_NAME, 
        ENGINE 
      FROM information_schema.tables
      WHERE TABLE_SCHEMA = ?
      `,
      [this.dbname]
    );
    return results.map((row) => ({
      name: row.TABLE_NAME,
      engine: row.ENGINE,
    }));
  }

  async getColumns(tableName: string): Promise<Record<string, any>[]> {
    let results = await this.raw(
      `
      SELECT 
        COLUMN_NAME,
        COLUMN_TYPE,
        COLUMN_DEFAULT,
        IS_NULLABLE,
        CHARACTER_MAXIMUM_LENGTH,
        ORDINAL_POSITION
      FROM information_schema.columns
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
      `,
      [this.dbname, tableName]
    );

    return results.map((row) => ({
      name: row.COLUMN_NAME,
      type: row.COLUMN_TYPE,
      default: row.COLUMN_DEFAULT,
      nullable: row.IS_NULLABLE,
      charMaxLength: row.CHARACTER_MAXIMUM_LENGTH,
      ordinalPosition: row.ORDINAL_POSITION,
    }));
  }

  async getIndexes(tableName: string): Promise<Record<string, any>[]> {
    let results = await this.raw(`SHOW INDEX FROM ${this.dbname}.${tableName}`);
    return results.map((row) => ({
      key_name: row.Key_name,
      isUnique: row.Mon_unique ? true : false,
      column: row.Column_name,
      sequence_no: row.Seq_in_index,
    }));
  }

  async getStoredProcedures(): Promise<Record<string, any>[]> {
    let results = await this.raw(
      `
      SELECT 
        ROUTINE_NAME, 
        ROUTINE_DEFINITION
      FROM information_schema.ROUTINES 
      WHERE ROUTINE_SCHEMA = ?
      AND ROUTINE_TYPE = 'PROCEDURE'
      `,
      [this.dbname]
    );
    return results.map((row) => ({
      name: row.ROUTINE_NAME,
      definition: row.ROUTINE_DEFINITION,
    }));
  }

  async getStoredProcParams(spName: string): Promise<Record<string, any>[]> {
    let results = await this.raw(
      `
      SELECT 
        PARAMETER_NAME,
        ORDINAL_POSITION,
        DATA_TYPE,
        CHARACTER_MAXIMUM_LENGTH,
        PARAMETER_MODE
      FROM information_schema.PARAMETERS
      WHERE SPECIFIC_SCHEMA = ?
        AND SPECIFIC_NAME = ?;
      `,
      [this.dbname, spName]
    );
    return results.map((row) => ({
      name: row.PARAMETER_NAME,
      ordinal_position: row.ORDINAL_POSITION,
      type: row.DATA_TYPE,
      charMaxLength: row.CHARACTER_MAXIMUM_LENGTH,
      mode: row.PARAMETER_MODE,
    }));
  }

  async getFunctions(): Promise<Record<string, any>[]> {
    let results = await this.raw(
      `
      SELECT 
        ROUTINE_NAME, 
        DATA_TYPE,
        ROUTINE_DEFINITION
      FROM information_schema.ROUTINES 
      WHERE ROUTINE_SCHEMA = ?
      AND ROUTINE_TYPE = 'FUNCTION'
      `,
      [this.dbname]
    );
    return results.map((row) => ({
      name: row.ROUTINE_NAME,
      type: row.DATA_TYPE,
      definition: row.ROUTINE_DEFINITION,
    }));
  }

  async getFunctionParams(fnName: string): Promise<Record<string, any>[]> {
    let results = await this.raw(
      `
      SELECT 
        PARAMETER_NAME,
        ORDINAL_POSITION,
        DATA_TYPE,
        CHARACTER_MAXIMUM_LENGTH,
        PARAMETER_MODE
      FROM information_schema.PARAMETERS
      WHERE SPECIFIC_SCHEMA = ?
        AND SPECIFIC_NAME = ?
        AND ORDINAL_POSITION > 0;
      `,
      [this.dbname, fnName]
    );
    return results.map((row) => ({
      name: row.PARAMETER_NAME,
      ordinal_position: row.ORDINAL_POSITION,
      type: row.DATA_TYPE,
      charMaxLength: row.CHARACTER_MAXIMUM_LENGTH,
      mode: row.PARAMETER_MODE,
    }));
  }

  async showCreate(type: string, name: string): Promise<string> {
    let objectType = titleCase(type);
    return await this.raw(`SHOW CREATE ${objectType} ${this.dbname}.${name}`)
      .then((result) => result[0][`Create ${objectType}`])
      .catch((err) => {
        console.error(err.message);
        return undefined;
      });
  }
}
