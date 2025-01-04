import {
  ColumnInfo,
  ConnectionOptions,
  Diff,
  IndexInfo,
  TableInfo,
} from "./diff";

export class MySqlDiff extends Diff {
  constructor(options: ConnectionOptions) {
    super(options);
  }

  async getTables(): Promise<TableInfo[]> {
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

  async getColumns(tableName: string): Promise<ColumnInfo[]> {
    let results = await this.raw(
      `
      SELECT 
        COLUMN_NAME,
        COLUMN_TYPE,
        COLUMN_DEFAULT,
        IS_NULLABLE,
        COLUMN_KEY,
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
      key: row.COLUMN_KEY,
      charMaxLength: row.CHARACTER_MAXIMUM_LENGTH,
      ordinalPosition: row.ORDINAL_POSITION,
    }));
  }

  async getIndexes(tableName: string): Promise<IndexInfo[]> {
    let results = await this.raw(`SHOW INDEX FROM ${tableName}`);
    return results.map((row) => ({
      key_name: row.Key_name,
      isUnique: row.Mon_unique ? true : false,
      column: row.Column_name,
      sequence_no: row.Seq_in_index,
    }));
  }
}
