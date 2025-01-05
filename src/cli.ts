import { Command } from "commander";
import { MySqlDiff } from "./mysql-diff";
import { Diff, ConnectionOptions, ComparisonOptions } from "./diff";
import { basename, dirname } from "path";
import { URL } from "url";
import { existsSync, mkdirSync, writeFileSync } from "fs";

type DiffOptions = Omit<ConnectionOptions, "client">;

const supported: Record<string, (options: DiffOptions) => Diff> = {
  "mysql:": (options) =>
    new MySqlDiff({
      client: "mysql",
      ...options,
    }),
};

function createConnection(url: URL, options: ComparisonOptions): Diff {
  if (!supported[url.protocol]) {
    throw new Error(
      `${url.protocol} not supported. protocols ${Object.keys(supported)}`
    );
  }
  return supported[url.protocol]({
    database: basename(url.pathname),
    host: url.hostname,
    port: Number(url.port) || undefined,
    user: url.username,
    password: url.password,
    options,
  });
}

const program = new Command();

program
  .command("compare <dbURL1> <dbURL2>")
  .option("-e", "eager check all errors in schema object")
  .option("-v", "show console logs regarding database connection activity")
  .option("-o <filename>", "output")
  .option("-p", "pretty output")
  .option("-a", "include A, B schema in output")
  .description(
    `DB URL format: <protocol>://<user>[:password]@<address>[:port]/<dbname>

    example:
    rdbdiff compare mysql://user@localhost:3308/db1 mysql://user@localhost:3308/db2
    rdbdiff compare mysql://user:secret@localhost:3308/db1 mysql://user:secret@localhost:3308/db2
    `
  )
  .summary("Check the difference between database schemas.")
  .action(async function () {
    const opts = this.opts();
    const args = this.args;
    const eager = opts["e"] || false;
    const verbose = opts["v"] || false;
    const outfile = opts["o"] || undefined;
    const pretty = opts["p"] || false;
    const all = opts["a"] || false;
    const [dbUrl1, dbUrl2] = args;
    const url1 = URL.parse(dbUrl1);
    const url2 = URL.parse(dbUrl2);
    if (!url1) throw new Error(`invalid url: ${dbUrl1}`);
    if (!url2) throw new Error(`invalid url: ${dbUrl2}`);
    if (url1.protocol !== url2.protocol) {
      throw new Error(
        `protocol mismatch: ${url1.protocol} != ${url2.protocol}`
      );
    }
    const A = createConnection(url1, { eager, verbose });
    const B = createConnection(url2, { eager, verbose });
    await Promise.all([A.load(), B.load()]);
    const output = {
      result: A.compare(B),
      ...(all ? { A, B } : {}),
    };
    if (outfile) {
      if (!existsSync(dirname(outfile))) {
        mkdirSync(dirname(outfile), { recursive: true });
      }
      writeFileSync(outfile, JSON.stringify(output, null, pretty ? 2 : 0));
    } else {
      console.log(output);
    }
  });

module.exports = {
  program,
};
