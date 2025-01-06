drop database if exists A;
drop database if exists B;
create database A;
create database B;
-- no issue
CREATE TABLE IF NOT EXISTS A.`scenario_no_issue` (
  `id` INT PRIMARY KEY AUTO_INCREMENT
);
CREATE TABLE IF NOT EXISTS B.`scenario_no_issue` (
  `id` INT PRIMARY KEY AUTO_INCREMENT
);
-- missing table
CREATE TABLE IF NOT EXISTS A.`scenario_missing_table` (
  `id` INT PRIMARY KEY AUTO_INCREMENT
);
-- missing column
CREATE TABLE IF NOT EXISTS A.`scenario_missing_column` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `column1` INT DEFAULT 1
);
CREATE TABLE IF NOT EXISTS B.`scenario_missing_column` (
  `id` INT PRIMARY KEY AUTO_INCREMENT
);
-- mismatch column
CREATE TABLE IF NOT EXISTS A.`scenario_mismatch_column_type` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `column1` INT DEFAULT 1
);
CREATE TABLE IF NOT EXISTS B.`scenario_mismatch_column_type` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `column1` INT DEFAULT 0
);
-- missing and mismatch columns
CREATE TABLE IF NOT EXISTS A.`scenario_missing_mismatch_columns` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `column1` INT DEFAULT 1,
  `column2` INT DEFAULT 1,
  `column3` INT DEFAULT 1
);
CREATE TABLE IF NOT EXISTS B.`scenario_missing_mismatch_columns` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `column1` INT DEFAULT 1,
  `column2` INT DEFAULT 0
);
-- missing index
CREATE TABLE IF NOT EXISTS A.`scenario_missing_index` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `column1` INT DEFAULT 1,
  `column2` INT DEFAULT 1
);
CREATE TABLE IF NOT EXISTS B.`scenario_missing_index` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `column1` INT DEFAULT 1,
  `column2` INT DEFAULT 1
);
CREATE INDEX ix ON A.scenario_missing_index(`column1`);
-- mismatch index column
CREATE TABLE IF NOT EXISTS A.`scenario_same_ix_name_diff_column` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `column1` INT DEFAULT 1,
  `column2` INT DEFAULT 1
);
CREATE TABLE IF NOT EXISTS B.`scenario_same_ix_name_diff_column` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `column1` INT DEFAULT 1,
  `column2` INT DEFAULT 1
);
CREATE INDEX ix ON A.scenario_same_ix_name_diff_column(`column1`);
CREATE INDEX ix ON B.scenario_same_ix_name_diff_column(`column2`);
-- mismatch index sequence
CREATE TABLE IF NOT EXISTS A.`scenario_mismatch_index_sequence` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `column1` INT DEFAULT 1,
  `column2` INT DEFAULT 1
);
CREATE TABLE IF NOT EXISTS B.`scenario_mismatch_index_sequence` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `column1` INT DEFAULT 1,
  `column2` INT DEFAULT 1
);
CREATE UNIQUE INDEX ux ON A.scenario_mismatch_index_sequence(`column1`, `column2`);
CREATE UNIQUE INDEX ux ON B.scenario_mismatch_index_sequence(`column2`, `column1`);
-- missing index column with mismatch in sequence
CREATE TABLE IF NOT EXISTS A.`scenario_missing_index_column_mismatch_sequence` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `column1` INT DEFAULT 1,
  `column2` INT DEFAULT 1,
  `column3` INT DEFAULT 1
);
CREATE TABLE IF NOT EXISTS B.`scenario_missing_index_column_mismatch_sequence` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `column1` INT DEFAULT 1,
  `column2` INT DEFAULT 1,
  `column3` INT DEFAULT 1
);
CREATE UNIQUE INDEX ux ON A.scenario_missing_index_column_mismatch_sequence(`column1`, `column2`, `column3`);
CREATE UNIQUE INDEX ux ON B.scenario_missing_index_column_mismatch_sequence(`column2`, `column1`);
-- missing stored procedure
DELIMITER $$
CREATE PROCEDURE A.sp_missing(p_0 INT)
BEGIN
	SELECT p_0 AS `result`;
END;
$$
-- mismatch stored procedure parameters
CREATE PROCEDURE A.sp_mismatch_params(p_0 INT)
BEGIN
	SELECT p_0 AS `result`;
END;
$$
CREATE PROCEDURE B.sp_mismatch_params(p_0 VARCHAR(50))
BEGIN
	SELECT p_0 AS `result`;
END;
$$
-- stored procedure whitespaces
CREATE PROCEDURE A.sp_whitespaces(p_0 INT)
BEGIN
	SELECT p_0 AS `result`;
END;
$$
CREATE PROCEDURE B.sp_whitespaces(p_0 INT)
BEGIN
	  SELECT p_0 
    AS `result`;
END;
$$
-- missing function
CREATE FUNCTION A.fn_missing(p_0 INT)
RETURNS DATE
DETERMINISTIC
BEGIN
    RETURN 1;
END;
$$
-- mismatch function parameters and definition
CREATE FUNCTION A.fn_mismatch_params(p_0 DATETIME)
RETURNS DATETIME
NOT DETERMINISTIC
READS SQL DATA
BEGIN
    RETURN NOW();
END;
$$
CREATE FUNCTION B.fn_mismatch_params(p_0 INT)
RETURNS INT
DETERMINISTIC
BEGIN
    RETURN 1;
END;
$$
-- function whitespaces
CREATE FUNCTION A.fn_whitespaces(p_0 INT)
RETURNS INT
DETERMINISTIC
BEGIN
    RETURN 1;
END;
$$
CREATE FUNCTION B.fn_whitespaces(p_0 INT)
RETURNS INT
DETERMINISTIC
BEGIN
      RETURN 1;
END;
$$
DELIMITER ;
