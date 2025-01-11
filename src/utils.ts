import { existsSync, mkdirSync, WriteFileOptions, writeFileSync } from "fs";
import { dirname } from "path";

export function mkdirIfNotExist(path: string): string {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
  return path;
}

export function dumpToFile(
  path: string,
  data: string,
  options?: WriteFileOptions
): void {
  mkdirIfNotExist(dirname(path));
  writeFileSync(path, data, options);
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
