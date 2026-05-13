import { IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumberString, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class MspComplianceThresholdDto {
  @IsString()
  @IsNotEmpty()
  currencyCode!: string;

  @IsNumberString()
  amount!: string;
}

export class MspComplianceKycDto {
  @IsOptional()
  @IsIn(["always", "above_threshold"])
  enforceMode?: "always" | "above_threshold";

  @IsOptional()
  @IsBoolean()
  requireCustomerAboveThreshold?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MspComplianceThresholdDto)
  requiredAbove?: MspComplianceThresholdDto[];
}

export class MspComplianceAmlDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MspComplianceThresholdDto)
  largeTx?: MspComplianceThresholdDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  structuringWindowHours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(50)
  structuringMinCount?: number;
}

export class MspCompliancePolicyDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => MspComplianceKycDto)
  kyc?: MspComplianceKycDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MspComplianceAmlDto)
  aml?: MspComplianceAmlDto;
}

export class UpdateMspSettingsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  baseCurrencyCode?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MspCompliancePolicyDto)
  compliance?: MspCompliancePolicyDto;
}

export class CreateMspCurrencyDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  symbol?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  decimals?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateMspCurrencyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  symbol?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  decimals?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertMspRateDto {
  @IsString()
  @IsNotEmpty()
  baseCode!: string;

  @IsString()
  @IsNotEmpty()
  quoteCode!: string;

  @IsString()
  @IsNotEmpty()
  effectiveDate!: string;

  @IsNumberString()
  buyRate!: string;

  @IsNumberString()
  sellRate!: string;
}

export class BulkUpsertMspRatesDto {
  @IsString()
  @IsNotEmpty()
  baseCode!: string;

  @IsString()
  @IsNotEmpty()
  effectiveDate!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkUpsertMspRateItemDto)
  items!: BulkUpsertMspRateItemDto[];
}

export class BulkUpsertMspRateItemDto {
  @IsString()
  @IsNotEmpty()
  quoteCode!: string;

  @IsNumberString()
  buyRate!: string;

  @IsNumberString()
  sellRate!: string;
}

export class GetMspRatesQueryDto {
  @IsOptional()
  @IsString()
  baseCode?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsIn(["all"])
  scope?: "all";
}

export class CreateMspExchangeTicketDto {
  @IsString()
  @IsNotEmpty()
  quoteCode!: string;

  @IsString()
  @IsNotEmpty()
  baseCode!: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsString()
  @IsNotEmpty()
  effectiveDate!: string;

  @IsIn(["buy", "sell"])
  type!: "buy" | "sell";

  @IsNumberString()
  quoteAmount!: string;

  @IsNumberString()
  rate!: string;

  @IsOptional()
  @IsNumberString()
  feeBase?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsString()
  @IsNotEmpty()
  baseAccountId!: string;

  @IsString()
  @IsNotEmpty()
  quoteAccountId!: string;
}

export class ListMspExchangeTicketsQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(["buy", "sell"])
  type?: "buy" | "sell";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class CreateMspHawalaPartnerDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateMspHawalaPartnerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateMspHawalaTransferDto {
  @IsString()
  @IsNotEmpty()
  currencyCode!: string;

  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsNumberString()
  fee?: string;

  @IsOptional()
  @IsIn(["cash", "customer_wallet"])
  fundingSource?: "cash" | "customer_wallet";

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsString()
  @IsNotEmpty()
  senderName!: string;

  @IsOptional()
  @IsString()
  senderPhone?: string;

  @IsString()
  @IsNotEmpty()
  receiverName!: string;

  @IsOptional()
  @IsString()
  receiverPhone?: string;

  @IsOptional()
  @IsString()
  partnerId?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  transferDate?: string;

  @IsOptional()
  @IsString()
  receiveAccountId?: string;
}

export class CreateMspHawalaPayoutDto {
  @IsOptional()
  @IsNumberString()
  paidAmount?: string;

  @IsOptional()
  @IsString()
  payAccountId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ListMspHawalaTransfersQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(["open", "paid", "cancelled"])
  status?: "open" | "paid" | "cancelled";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class CreateMspCustomerDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateMspCustomerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateMspCustomerKycDto {
  @IsOptional()
  @IsIn(["none", "pending", "verified", "rejected"])
  status?: "none" | "pending" | "verified" | "rejected";

  @IsOptional()
  @IsString()
  documentFrontFileId?: string;

  @IsOptional()
  @IsString()
  documentBackFileId?: string;

  @IsOptional()
  @IsString()
  selfieFileId?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  fatherName?: string;

  @IsOptional()
  @IsIn(["male", "female", "other"])
  gender?: "male" | "female" | "other";

  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsString()
  nationalId?: string;

  @IsOptional()
  @IsString()
  documentType?: string;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsString()
  documentIssuer?: string;

  @IsOptional()
  @IsString()
  documentExpiry?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  occupation?: string;

  @IsOptional()
  @IsString()
  sourceOfFunds?: string;

  @IsOptional()
  @IsBoolean()
  isPep?: boolean;

  @IsOptional()
  @IsIn(["low", "medium", "high"])
  riskLevel?: "low" | "medium" | "high";

  @IsOptional()
  @IsString()
  note?: string;
}

export class ListMspCustomersQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(["all", "active", "inactive"])
  status?: "all" | "active" | "inactive";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class CreateMspBranchDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateMspBranchDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateMspCashMovementDto {
  @IsIn(["in", "out"])
  direction!: "in" | "out";

  @IsString()
  @IsNotEmpty()
  currencyCode!: string;

  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsString()
  movementDate?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ListMspCashMovementsQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsIn(["in", "out", "all"])
  direction?: "in" | "out" | "all";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class CreateMspSettlementDto {
  @IsString()
  @IsNotEmpty()
  partnerId!: string;

  @IsIn(["in", "out"])
  direction!: "in" | "out";

  @IsString()
  @IsNotEmpty()
  currencyCode!: string;

  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsString()
  settlementDate?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsString()
  @IsNotEmpty()
  accountId!: string;
}

export class CreateMspAccountDto {
  @IsIn(["cash", "bank"])
  type!: "cash" | "bank";

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  currencyCode!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumberString()
  openingBalance?: string;
}

export class UpdateMspAccountDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateMspAccountTransferDto {
  @IsString()
  @IsNotEmpty()
  fromAccountId!: string;

  @IsString()
  @IsNotEmpty()
  toAccountId!: string;

  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsString()
  transferDate?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateMspAccountAdjustmentDto {
  @IsString()
  @IsNotEmpty()
  accountId!: string;

  @IsIn(["in", "out"])
  direction!: "in" | "out";

  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsString()
  entryDate?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateMspCustomerWalletDepositDto {
  @IsString()
  @IsNotEmpty()
  currencyCode!: string;

  @IsString()
  @IsNotEmpty()
  cashAccountId!: string;

  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsString()
  entryDate?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateMspCustomerWalletWithdrawDto {
  @IsString()
  @IsNotEmpty()
  currencyCode!: string;

  @IsString()
  @IsNotEmpty()
  cashAccountId!: string;

  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsString()
  entryDate?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class RepairMspHawalaPayableFeeDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class BackfillMspLedgerDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class BackfillMspFxWacDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class GetMspCustomerWalletsQueryDto {
  @IsOptional()
  @IsString()
  ids?: string;

  @IsOptional()
  @IsString()
  currencyCodes?: string;
}

export class GetMspPartnerBalancesQueryDto {
  @IsOptional()
  @IsString()
  ids?: string;

  @IsOptional()
  @IsString()
  currencyCodes?: string;
}

export class ListMspPartnerStatementQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class ListMspSettlementsQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  partnerId?: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class MspReportsRangeQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class ListMspAmlAlertsQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsIn(["all", "open", "closed"])
  status?: "all" | "open" | "closed";

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class CloseMspAmlAlertDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class MspReportExportLogDto {
  @IsIn(["xlsx"])
  format!: "xlsx";

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class ListMspAuditQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  actorUserId?: string;
}

export class MspAuditExportLogDto {
  @IsIn(["xlsx"])
  format!: "xlsx";

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class ListMspLedgerEventsQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class GetMspFxProfitQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class MspCashSessionDenominationItemDto {
  @IsNumberString()
  value!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  qty!: number;
}

export class OpenMspCashSessionDto {
  @IsString()
  @IsNotEmpty()
  accountId!: string;

  @IsOptional()
  @IsString()
  openedAt?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CloseMspCashSessionDto {
  @IsOptional()
  @IsString()
  closedAt?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MspCashSessionDenominationItemDto)
  denominations!: MspCashSessionDenominationItemDto[];
}

export class ListMspCashSessionsQueryDto {
  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsIn(["open", "closed", "all"])
  status?: "open" | "closed" | "all";

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class CreateMspBankStatementDto {
  @IsString()
  @IsNotEmpty()
  accountId!: string;

  @IsString()
  @IsNotEmpty()
  statementFrom!: string;

  @IsString()
  @IsNotEmpty()
  statementTo!: string;

  @IsOptional()
  @IsNumberString()
  openingBalance?: string;

  @IsOptional()
  @IsNumberString()
  closingBalance?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ListMspBankStatementsQueryDto {
  @IsString()
  @IsNotEmpty()
  accountId!: string;
}

export class MspBankStatementLineItemDto {
  @IsString()
  @IsNotEmpty()
  lineDate!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsNumberString()
  amountSigned!: string;

  @IsOptional()
  @IsNumberString()
  balance?: string;
}

export class ImportMspBankStatementLinesDto {
  @IsOptional()
  @IsBoolean()
  replace?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MspBankStatementLineItemDto)
  lines!: MspBankStatementLineItemDto[];
}

export class ListMspBankStatementLinesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number;

  @IsOptional()
  @IsIn(["matched", "unmatched", "all"])
  match?: "matched" | "unmatched" | "all";
}

export class AutoMatchMspBankStatementDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  daysTolerance?: number;
}

export class MatchMspBankStatementLineDto {
  @IsOptional()
  @IsString()
  ledgerEntryId?: string;
}

export class LockMspBankStatementDto {
  @IsOptional()
  @IsBoolean()
  lock?: boolean;
}

export class CreateMspBankStatementAdjustmentDto {
  @IsNumberString()
  amountSigned!: string;

  @IsOptional()
  @IsString()
  entryDate?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
