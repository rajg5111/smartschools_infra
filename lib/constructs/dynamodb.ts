import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

/**
 * Defines a column/attribute for DynamoDB table
 * Note: In DynamoDB, you only need to explicitly define attributes that are used as keys.
 * Other attributes are schema-less and can be added dynamically.
 */
export interface ColumnDefinition {
  /**
   * The column name
   */
  name: string;

  /**
   * The column data type
   */
  type: dynamodb.AttributeType;
}

export interface TableDefinition {
  /**
   * The table name
   */
  tableName: string;

  /**
   * The partition key definition
   */
  partitionKey: {
    name: string;
    type: dynamodb.AttributeType;
  };

  /**
   * The sort key definition (optional)
   */
  sortKey?: {
    name: string;
    type: dynamodb.AttributeType;
  };

  /**
   * Additional columns/attributes for the table (optional)
   * These are used to define attribute definitions for GSIs and other operations
   */
  columns?: ColumnDefinition[];

  /**
   * Global Secondary Indexes (optional)
   */
  globalSecondaryIndexes?: {
    indexName: string;
    partitionKey: {
      name: string;
      type: dynamodb.AttributeType;
    };
    sortKey?: {
      name: string;
      type: dynamodb.AttributeType;
    };
    projectionType?: dynamodb.ProjectionType;
  }[];

  /**
   * Whether to enable DynamoDB streams
   * @default false
   */
  //streamEnabled?: boolean;

  /**
   * Stream view type if streams are enabled
   * @default NEW_AND_OLD_IMAGES
   */
  //streamViewType?: dynamodb.StreamViewType;
}

export interface DynamoDBConstructProps {
  /**
   * The stage/environment (e.g., 'dev', 'prod')
   */
  //stage: string;

  /**
   * The environment name (e.g., 'development', 'production')
   */
  environment: string;
  readOnlyRole: iam.Role;
  readWriteRole: iam.Role;

  /**
   * Table definitions to create
   */
  table: TableDefinition;

  /**
   * Whether to enable point-in-time recovery
   * @default false
   */
  //pointInTimeRecovery?: boolean;

  /**
   * The billing mode for the tables
   * @default PAY_PER_REQUEST
   */
  //billingMode?: dynamodb.BillingMode;

  /**
   * Read capacity units (only used with PROVISIONED billing mode)
   * @default undefined
   */
  //readCapacity?: number;

  /**
   * Write capacity units (only used with PROVISIONED billing mode)
   * @default undefined
   */
  //writeCapacity?: number;

  /**
   * Project name for tagging
   * @default "SmartSchools"
   */
  projectName: string;
}

export class DynamoDBConstruct extends Construct {
  // public readonly tables: Map<string, dynamodb.Table> = new Map();
  public readonly table: dynamodb.Table;
  private readonly tableDefinition: TableDefinition;

  // IAM roles for different access patterns
  // public readonly readOnlyRole: iam.Role;
  // public readonly readWriteRole: iam.Role;
  // public readonly adminRole: iam.Role;

  constructor(scope: Construct, id: string, props: DynamoDBConstructProps) {
    super(scope, id);

    // Store table definition for later use
    this.tableDefinition = props.table;

    // const stage = props.stage;
    const environment = props.environment;
    const projectName = props.projectName;

    // Common table properties
    const commonTableProps = {};

    // Collect all attribute definitions needed for keys and GSIs
    // Note: In DynamoDB, you only need to define attributes that are used as keys
    // (partition key, sort key, or GSI keys). Other attributes are schema-less.
    const attributeDefinitions: { [key: string]: dynamodb.AttributeType } = {};

    // Add primary key attributes
    attributeDefinitions[props.table.partitionKey.name] =
      props.table.partitionKey.type;
    if (props.table.sortKey) {
      attributeDefinitions[props.table.sortKey.name] = props.table.sortKey.type;
    }

    // Add GSI key attributes
    if (props.table.globalSecondaryIndexes) {
      props.table.globalSecondaryIndexes.forEach((gsi) => {
        attributeDefinitions[gsi.partitionKey.name] = gsi.partitionKey.type;
        if (gsi.sortKey) {
          attributeDefinitions[gsi.sortKey.name] = gsi.sortKey.type;
        }
      });
    }

    // Add any additional columns that might be used as keys in future GSIs or LSIs
    // This provides a way to pre-define attributes for documentation and future use
    if (props.table.columns) {
      props.table.columns.forEach((column) => {
        // Only add if not already defined (avoid duplicates)
        if (!attributeDefinitions[column.name]) {
          attributeDefinitions[column.name] = column.type;
        }
      });
    }

    // Create table dynamically based on the table definitions
    this.table = new dynamodb.Table(this, `${props.table.tableName}`, {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      tableName: `${props.table.tableName}-${environment}`,
      partitionKey: props.table.partitionKey,
      sortKey: props.table.sortKey,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
        recoveryPeriodInDays: 7,
      },
      contributorInsightsSpecification: {
        enabled: false,
      },
    });
    if (props.table.globalSecondaryIndexes) {
      props.table.globalSecondaryIndexes.forEach((gsi) => {
        this.table.addGlobalSecondaryIndex({
          indexName: gsi.indexName,
          partitionKey: gsi.partitionKey,
          sortKey: gsi.sortKey,
          projectionType: gsi.projectionType || dynamodb.ProjectionType.ALL,
        });
      });
      // Store the table in the map for easy access
      // this.tables.set(tableDefinition.tableName, table);

      // Create outputs for the table
      new cdk.CfnOutput(this, `${props.table.tableName}TableName`, {
        value: this.table.tableName,
        description: `${props.table.tableName} table name`,
        exportName: `${props.table.tableName}-TableName-${environment}`,
      });

      new cdk.CfnOutput(this, `${props.table.tableName}TableArn`, {
        value: this.table.tableArn,
        description: `${props.table.tableName} table ARN`,
        exportName: `${props.table.tableName}-TableArn-${environment}`,
      });

      // Create IAM roles for different access patterns

      // Admin role for administrative operations
      // this.adminRole = new iam.Role(this, "DynamoDBAdminRole", {
      //   assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      //   description: `Full administrative access to ${projectName} DynamoDB tables`,
      //   roleName: `${projectName}-DynamoDB-Admin-${stage}`,
      // });

      // Grant permissions to all tables for each role

      this.table.grantReadData(props.readOnlyRole);

      // Read-write permissions
      this.table.grantReadWriteData(props.readWriteRole);
      // Add basic Lambda execution permissions to all roles
      // const basicLambdaPolicy = iam.ManagedPolicy.fromAwsManagedPolicyName(
      //  // "service-role/AWSLambdaBasicExecutionRole"
      // );

      // this.readOnlyRole.addManagedPolicy(basicLambdaPolicy);
      // this.readWriteRole.addManagedPolicy(basicLambdaPolicy);
      // this.adminRole.addManagedPolicy(basicLambdaPolicy);

      // // Output role ARNs
      // new cdk.CfnOutput(this, "DynamoDBReadOnlyRoleArn", {
      //   value: this.readOnlyRole.roleArn,
      //   description: "DynamoDB read-only role ARN",
      //   exportName: `${projectName}-DynamoDB-ReadOnly-RoleArn-${stage}`,
      // });

      // new cdk.CfnOutput(this, "DynamoDBReadWriteRoleArn", {
      //   value: this.readWriteRole.roleArn,
      //   description: "DynamoDB read-write role ARN",
      //   exportName: `${projectName}-DynamoDB-ReadWrite-RoleArn-${stage}`,
      // });

      // new cdk.CfnOutput(this, "DynamoDBAdminRoleArn", {
      //   value: this.adminRole.roleArn,
      //   description: "DynamoDB admin role ARN",
      //   exportName: `${projectName}-DynamoDB-Admin-RoleArn-${stage}`,
      // });
    }

    /**
     * Helper method to get a specific table by name
     */
    // public getTable(tableName: string): dynamodb.Table | undefined {
    //   return this.tables.get(tableName);
    // }

    // /**
    //  * Helper method to get all table names
    //  */
    // public getAllTableNames(): string[] {
    //   return Array.from(this.tables.values()).map((table) => table.tableName);
    // }

    // /**
    //  * Helper method to get all table ARNs
    //  */
    // public getAllTableArns(): string[] {
    //   return Array.from(this.tables.values()).map((table) => table.tableArn);
    // }

    // /**
    //  * Helper method to get all tables
    //  */
    // public getAllTables(): dynamodb.Table[] {
    //   return Array.from(this.tables.values());
    // }
  }

  /**
   * Get the defined columns for the table
   * Useful for documentation, validation, or client-side type generation
   */
  public getTableColumns(): ColumnDefinition[] {
    // Return all defined columns including keys
    const columns: ColumnDefinition[] = [];

    // Add partition key
    columns.push({
      name: this.tableDefinition.partitionKey.name,
      type: this.tableDefinition.partitionKey.type,
    });

    // Add sort key if exists
    if (this.tableDefinition.sortKey) {
      columns.push({
        name: this.tableDefinition.sortKey.name,
        type: this.tableDefinition.sortKey.type,
      });
    }

    // Add additional columns if defined
    if (this.tableDefinition.columns) {
      this.tableDefinition.columns.forEach((column: ColumnDefinition) => {
        // Avoid duplicates
        if (!columns.find((c) => c.name === column.name)) {
          columns.push(column);
        }
      });
    }

    return columns;
  }

  /**
   * Helper method to grant read access to a principal for all tables
   */
  //   public grantReadAccess(principal: iam.IPrincipal): void {
  //    this.table.grantReadData(principal);
  //   }

  //   /**
  //    * Helper method to grant read-write access to a principal for all tables
  //    */
  //   public grantReadWriteAccess(principal: iam.IPrincipal): void {
  //     this.tables.forEach((table) => {
  //       table.grantReadWriteData(principal);
  //     });
  //   }

  //   /**
  //    * Helper method to grant full access to a principal for all tables
  //    */
  //   public grantFullAccess(principal: iam.IPrincipal): void {
  //     this.tables.forEach((table) => {
  //       table.grantFullAccess(principal);
  //     });
  //   }
}
