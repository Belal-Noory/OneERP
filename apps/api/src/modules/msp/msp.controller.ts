import { Body, Controller, Get, HttpException, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { MembershipModuleGuard } from "../../shared/membership-module.guard";
import { ModuleEnabledGuard } from "../../shared/module-enabled.guard";
import { RequirePermissions } from "../../shared/permissions.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { TenantGuard } from "../../shared/tenant.guard";
import {
  BulkUpsertMspRatesDto,
  BackfillMspLedgerDto,
  BackfillMspFxWacDto,
  CreateMspAccountAdjustmentDto,
  CreateMspAccountDto,
  CreateMspAccountTransferDto,
  CreateMspCustomerDto,
  CreateMspCustomerWalletDepositDto,
  CreateMspCustomerWalletWithdrawDto,
  GetMspCustomerWalletsQueryDto,
  GetMspPartnerBalancesQueryDto,
  GetMspFxProfitQueryDto,
  ListMspPartnerStatementQueryDto,
  ListMspCashSessionsQueryDto,
  RepairMspHawalaPayableFeeDto,
  OpenMspCashSessionDto,
  CloseMspCashSessionDto,
  CreateMspBranchDto,
  CreateMspCashMovementDto,
  CreateMspCurrencyDto,
  CreateMspExchangeTicketDto,
  CreateMspHawalaPartnerDto,
  CreateMspHawalaPayoutDto,
  CreateMspHawalaTransferDto,
  GetMspRatesQueryDto,
  ListMspCustomersQueryDto,
  ListMspCashMovementsQueryDto,
  ListMspExchangeTicketsQueryDto,
  ListMspHawalaTransfersQueryDto,
  ListMspLedgerEventsQueryDto,
  ListMspSettlementsQueryDto,
  ListMspAuditQueryDto,
  ListMspAmlAlertsQueryDto,
  CloseMspAmlAlertDto,
  CreateMspBankStatementDto,
  ListMspBankStatementsQueryDto,
  ImportMspBankStatementLinesDto,
  ListMspBankStatementLinesQueryDto,
  AutoMatchMspBankStatementDto,
  MatchMspBankStatementLineDto,
  LockMspBankStatementDto,
  CreateMspBankStatementAdjustmentDto,
  MspAuditExportLogDto,
  MspReportExportLogDto,
  MspReportsRangeQueryDto,
  CreateMspSettlementDto,
  UpdateMspAccountDto,
  UpdateMspCustomerDto,
  UpdateMspCustomerKycDto,
  UpdateMspBranchDto,
  UpdateMspCurrencyDto,
  UpdateMspHawalaPartnerDto,
  UpdateMspSettingsDto,
  UpsertMspRateDto
} from "./dto/msp.dto";

@Controller("msp")
@UseGuards(AuthGuard("jwt"), TenantGuard, ModuleEnabledGuard("msp"), MembershipModuleGuard("msp"), PermissionsGuard)
export class MspController {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureMspTables(): Promise<void> {
    await this.prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await this.prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "MspSettings" ("tenantId" TEXT NOT NULL, "baseCurrencyCode" TEXT NOT NULL DEFAULT \'AFN\', "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MspSettings_pkey" PRIMARY KEY ("tenantId"))'
    );
    await this.prisma.$executeRawUnsafe(
      'ALTER TABLE "MspSettings" ADD COLUMN IF NOT EXISTS "nextExchangeTicketNumber" INTEGER NOT NULL DEFAULT 1'
    );
    await this.prisma.$executeRawUnsafe(
      'ALTER TABLE "MspSettings" ADD COLUMN IF NOT EXISTS "nextHawalaTransferNumber" INTEGER NOT NULL DEFAULT 1'
    );
    await this.prisma.$executeRawUnsafe('ALTER TABLE "MspSettings" ADD COLUMN IF NOT EXISTS "complianceJson" JSONB');

    await this.prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "MspCurrency" ("id" UUID NOT NULL DEFAULT uuid_generate_v4(), "tenantId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "symbol" TEXT, "decimals" INTEGER NOT NULL DEFAULT 2, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MspCurrency_pkey" PRIMARY KEY ("id"))'
    );
    await this.prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "MspCurrency_tenantId_code_key" ON "MspCurrency"("tenantId","code")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspCurrency_tenantId_idx" ON "MspCurrency"("tenantId")');

    await this.prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "MspExchangeRate" ("id" UUID NOT NULL DEFAULT uuid_generate_v4(), "tenantId" TEXT NOT NULL, "baseCode" TEXT NOT NULL, "quoteCode" TEXT NOT NULL, "effectiveDate" DATE NOT NULL, "buyRate" DECIMAL(20,6) NOT NULL, "sellRate" DECIMAL(20,6) NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedByUserId" TEXT, CONSTRAINT "MspExchangeRate_pkey" PRIMARY KEY ("id"))'
    );
    await this.prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "MspExchangeRate_tenantId_base_quote_date_key" ON "MspExchangeRate"("tenantId","baseCode","quoteCode","effectiveDate")'
    );
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspExchangeRate_tenantId_date_idx" ON "MspExchangeRate"("tenantId","effectiveDate")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspExchangeRate_tenantId_base_idx" ON "MspExchangeRate"("tenantId","baseCode")');

    await this.prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "MspExchangeTicket" ("id" UUID NOT NULL DEFAULT uuid_generate_v4(), "tenantId" TEXT NOT NULL, "ticketNumber" INTEGER NOT NULL, "type" TEXT NOT NULL, "baseCode" TEXT NOT NULL, "quoteCode" TEXT NOT NULL, "effectiveDate" DATE NOT NULL, "quoteAmount" DECIMAL(20,6) NOT NULL, "rate" DECIMAL(20,6) NOT NULL, "baseAmount" DECIMAL(20,6) NOT NULL, "feeBase" DECIMAL(20,6) NOT NULL DEFAULT 0, "customerName" TEXT, "customerPhone" TEXT, "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdByUserId" TEXT, CONSTRAINT "MspExchangeTicket_pkey" PRIMARY KEY ("id"))'
    );
    await this.prisma.$executeRawUnsafe('ALTER TABLE "MspExchangeTicket" ADD COLUMN IF NOT EXISTS "baseAccountId" UUID');
    await this.prisma.$executeRawUnsafe('ALTER TABLE "MspExchangeTicket" ADD COLUMN IF NOT EXISTS "quoteAccountId" UUID');
    await this.prisma.$executeRawUnsafe('ALTER TABLE "MspExchangeTicket" ADD COLUMN IF NOT EXISTS "customerId" UUID');
    await this.prisma.$executeRawUnsafe('ALTER TABLE "MspExchangeTicket" ADD COLUMN IF NOT EXISTS "valuationCurrencyCode" TEXT');
    await this.prisma.$executeRawUnsafe('ALTER TABLE "MspExchangeTicket" ADD COLUMN IF NOT EXISTS "realizedProfitValuation" DECIMAL(20,6)');
    await this.prisma.$executeRawUnsafe('ALTER TABLE "MspExchangeTicket" ADD COLUMN IF NOT EXISTS "costOfSoldValuation" DECIMAL(20,6)');
    await this.prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "MspExchangeTicket_tenantId_ticketNumber_key" ON "MspExchangeTicket"("tenantId","ticketNumber")'
    );
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspExchangeTicket_tenantId_createdAt_idx" ON "MspExchangeTicket"("tenantId","createdAt")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspExchangeTicket_tenantId_date_idx" ON "MspExchangeTicket"("tenantId","effectiveDate")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspExchangeTicket_tenantId_type_idx" ON "MspExchangeTicket"("tenantId","type")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspExchangeTicket_tenantId_valuation_idx" ON "MspExchangeTicket"("tenantId","valuationCurrencyCode")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspExchangeTicket_tenantId_customer_idx" ON "MspExchangeTicket"("tenantId","customerId")');

    await this.prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "MspAccount" ("id" UUID NOT NULL DEFAULT uuid_generate_v4(), "tenantId" TEXT NOT NULL, "type" TEXT NOT NULL, "name" TEXT NOT NULL, "currencyCode" TEXT NOT NULL, "branchId" UUID, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdByUserId" TEXT, "updatedByUserId" TEXT, CONSTRAINT "MspAccount_pkey" PRIMARY KEY ("id"))'
    );
    await this.prisma.$executeRawUnsafe('ALTER TABLE "MspAccount" ADD COLUMN IF NOT EXISTS "customerId" UUID');
    await this.prisma.$executeRawUnsafe('ALTER TABLE "MspAccount" ADD COLUMN IF NOT EXISTS "partnerId" UUID');
    await this.prisma.$executeRawUnsafe('ALTER TABLE "MspAccount" ADD COLUMN IF NOT EXISTS "systemCode" TEXT');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspAccount_tenantId_idx" ON "MspAccount"("tenantId")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspAccount_tenantId_currency_idx" ON "MspAccount"("tenantId","currencyCode")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspAccount_tenantId_type_idx" ON "MspAccount"("tenantId","type")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspAccount_tenantId_active_idx" ON "MspAccount"("tenantId","isActive")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspAccount_tenantId_customer_idx" ON "MspAccount"("tenantId","customerId")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspAccount_tenantId_partner_idx" ON "MspAccount"("tenantId","partnerId")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspAccount_tenantId_systemCode_idx" ON "MspAccount"("tenantId","systemCode")');
    await this.prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "MspAccount_customer_currency_uq" ON "MspAccount"("tenantId","customerId","currencyCode") WHERE "customerId" IS NOT NULL'
    );
    await this.prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "MspAccount_partner_currency_uq" ON "MspAccount"("tenantId","partnerId","currencyCode") WHERE "partnerId" IS NOT NULL'
    );
    await this.prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "MspAccount_system_currency_uq" ON "MspAccount"("tenantId","systemCode","currencyCode") WHERE "systemCode" IS NOT NULL'
    );

    await this.prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "MspLedgerEntry" ("id" UUID NOT NULL DEFAULT uuid_generate_v4(), "tenantId" TEXT NOT NULL, "accountId" UUID NOT NULL, "entryDate" DATE NOT NULL DEFAULT CURRENT_DATE, "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "source" TEXT NOT NULL, "ref" TEXT, "amountSigned" DECIMAL(20,6) NOT NULL, "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdByUserId" TEXT, CONSTRAINT "MspLedgerEntry_pkey" PRIMARY KEY ("id"))'
    );
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspLedgerEntry_tenantId_idx" ON "MspLedgerEntry"("tenantId")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspLedgerEntry_tenantId_account_idx" ON "MspLedgerEntry"("tenantId","accountId")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspLedgerEntry_tenantId_date_idx" ON "MspLedgerEntry"("tenantId","entryDate")');

    await this.prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "MspFxPosition" ("tenantId" TEXT NOT NULL, "currencyCode" TEXT NOT NULL, "valuationCurrencyCode" TEXT NOT NULL, "qty" DECIMAL(20,6) NOT NULL DEFAULT 0, "totalCostValuation" DECIMAL(20,6) NOT NULL DEFAULT 0, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MspFxPosition_pkey" PRIMARY KEY ("tenantId","currencyCode","valuationCurrencyCode"))'
    );
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspFxPosition_tenantId_idx" ON "MspFxPosition"("tenantId")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspFxPosition_tenantId_currency_idx" ON "MspFxPosition"("tenantId","currencyCode")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspFxPosition_tenantId_valuation_idx" ON "MspFxPosition"("tenantId","valuationCurrencyCode")');

    await this.prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "MspCustomer" ("id" UUID NOT NULL DEFAULT uuid_generate_v4(), "tenantId" TEXT NOT NULL, "name" TEXT NOT NULL, "phone" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdByUserId" TEXT, "updatedByUserId" TEXT, CONSTRAINT "MspCustomer_pkey" PRIMARY KEY ("id"))'
    );
    await this.prisma.$executeRawUnsafe('ALTER TABLE "MspCustomer" ADD COLUMN IF NOT EXISTS "kycStatus" TEXT NOT NULL DEFAULT \'none\'');
    await this.prisma.$executeRawUnsafe('ALTER TABLE "MspCustomer" ADD COLUMN IF NOT EXISTS "kycJson" JSONB');
    await this.prisma.$executeRawUnsafe('ALTER TABLE "MspCustomer" ADD COLUMN IF NOT EXISTS "kycUpdatedAt" TIMESTAMP(3)');
    await this.prisma.$executeRawUnsafe('ALTER TABLE "MspCustomer" ADD COLUMN IF NOT EXISTS "kycVerifiedAt" TIMESTAMP(3)');
    await this.prisma.$executeRawUnsafe('ALTER TABLE "MspCustomer" ADD COLUMN IF NOT EXISTS "kycVerifiedByUserId" TEXT');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspCustomer_tenantId_idx" ON "MspCustomer"("tenantId")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspCustomer_tenantId_active_idx" ON "MspCustomer"("tenantId","isActive")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspCustomer_tenantId_name_idx" ON "MspCustomer"("tenantId","name")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspCustomer_tenantId_kycStatus_idx" ON "MspCustomer"("tenantId","kycStatus")');

    await this.prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "MspBranch" ("id" UUID NOT NULL DEFAULT uuid_generate_v4(), "tenantId" TEXT NOT NULL, "name" TEXT NOT NULL, "code" TEXT, "address" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdByUserId" TEXT, "updatedByUserId" TEXT, CONSTRAINT "MspBranch_pkey" PRIMARY KEY ("id"))'
    );
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspBranch_tenantId_idx" ON "MspBranch"("tenantId")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspBranch_tenantId_active_idx" ON "MspBranch"("tenantId","isActive")');
    await this.prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "MspBranch_tenantId_code_key" ON "MspBranch"("tenantId","code") WHERE "code" IS NOT NULL');

    await this.prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "MspCashMovement" ("id" UUID NOT NULL DEFAULT uuid_generate_v4(), "tenantId" TEXT NOT NULL, "direction" TEXT NOT NULL, "movementDate" DATE NOT NULL DEFAULT CURRENT_DATE, "currencyCode" TEXT NOT NULL, "amount" DECIMAL(20,6) NOT NULL, "branchId" UUID, "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdByUserId" TEXT, CONSTRAINT "MspCashMovement_pkey" PRIMARY KEY ("id"))'
    );
    await this.prisma.$executeRawUnsafe('ALTER TABLE "MspCashMovement" ADD COLUMN IF NOT EXISTS "accountId" UUID');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspCashMovement_tenantId_idx" ON "MspCashMovement"("tenantId")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspCashMovement_tenantId_date_idx" ON "MspCashMovement"("tenantId","movementDate")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspCashMovement_tenantId_currency_idx" ON "MspCashMovement"("tenantId","currencyCode")');

    await this.prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "MspCashSession" ("id" UUID NOT NULL DEFAULT uuid_generate_v4(), "tenantId" TEXT NOT NULL, "accountId" UUID NOT NULL, "currencyCode" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT \'open\', "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "closedAt" TIMESTAMP(3), "openedBookBalance" DECIMAL(20,6) NOT NULL DEFAULT 0, "closedBookBalance" DECIMAL(20,6), "countedAmount" DECIMAL(20,6), "variance" DECIMAL(20,6), "denominationsJson" JSONB, "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdByUserId" TEXT, "closedByUserId" TEXT, CONSTRAINT "MspCashSession_pkey" PRIMARY KEY ("id"))'
    );
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspCashSession_tenantId_idx" ON "MspCashSession"("tenantId")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspCashSession_tenantId_account_idx" ON "MspCashSession"("tenantId","accountId")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspCashSession_tenantId_status_idx" ON "MspCashSession"("tenantId","status")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspCashSession_tenantId_openedAt_idx" ON "MspCashSession"("tenantId","openedAt")');
    await this.prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "MspCashSession_one_open_per_account" ON "MspCashSession"("tenantId","accountId") WHERE "status"=\'open\''
    );

    await this.prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "MspBankStatement" ("id" UUID NOT NULL DEFAULT uuid_generate_v4(), "tenantId" TEXT NOT NULL, "accountId" UUID NOT NULL, "currencyCode" TEXT NOT NULL, "statementFrom" DATE NOT NULL, "statementTo" DATE NOT NULL, "openingBalance" DECIMAL(20,6) NOT NULL DEFAULT 0, "closingBalance" DECIMAL(20,6) NOT NULL DEFAULT 0, "status" TEXT NOT NULL DEFAULT \'open\', "lockedAt" TIMESTAMP(3), "lockedByUserId" TEXT, "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdByUserId" TEXT, CONSTRAINT "MspBankStatement_pkey" PRIMARY KEY ("id"))'
    );
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspBankStatement_tenantId_idx" ON "MspBankStatement"("tenantId")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspBankStatement_tenantId_account_idx" ON "MspBankStatement"("tenantId","accountId")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspBankStatement_tenantId_date_idx" ON "MspBankStatement"("tenantId","statementFrom","statementTo")');

    await this.prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "MspBankStatementLine" ("id" UUID NOT NULL DEFAULT uuid_generate_v4(), "tenantId" TEXT NOT NULL, "statementId" UUID NOT NULL, "rowIndex" INTEGER NOT NULL DEFAULT 0, "lineDate" DATE NOT NULL, "description" TEXT, "reference" TEXT, "amountSigned" DECIMAL(20,6) NOT NULL, "balance" DECIMAL(20,6), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MspBankStatementLine_pkey" PRIMARY KEY ("id"))'
    );
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspBankStatementLine_tenantId_idx" ON "MspBankStatementLine"("tenantId")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspBankStatementLine_tenantId_statement_idx" ON "MspBankStatementLine"("tenantId","statementId")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspBankStatementLine_tenantId_date_idx" ON "MspBankStatementLine"("tenantId","lineDate")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspBankStatementLine_tenantId_amount_idx" ON "MspBankStatementLine"("tenantId","amountSigned")');

    await this.prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "MspBankStatementMatch" ("tenantId" TEXT NOT NULL, "statementLineId" UUID NOT NULL, "ledgerEntryId" UUID NOT NULL, "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "matchedByUserId" TEXT, CONSTRAINT "MspBankStatementMatch_pkey" PRIMARY KEY ("tenantId","statementLineId"))'
    );
    await this.prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "MspBankStatementMatch_tenant_ledger_uq" ON "MspBankStatementMatch"("tenantId","ledgerEntryId")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspBankStatementMatch_tenant_line_idx" ON "MspBankStatementMatch"("tenantId","statementLineId")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspBankStatementMatch_tenant_ledger_idx" ON "MspBankStatementMatch"("tenantId","ledgerEntryId")');

    await this.prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "MspSettlement" ("id" UUID NOT NULL DEFAULT uuid_generate_v4(), "tenantId" TEXT NOT NULL, "partnerId" UUID NOT NULL, "direction" TEXT NOT NULL, "settlementDate" DATE NOT NULL DEFAULT CURRENT_DATE, "currencyCode" TEXT NOT NULL, "amount" DECIMAL(20,6) NOT NULL, "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdByUserId" TEXT, CONSTRAINT "MspSettlement_pkey" PRIMARY KEY ("id"))'
    );
    await this.prisma.$executeRawUnsafe('ALTER TABLE "MspSettlement" ADD COLUMN IF NOT EXISTS "accountId" UUID');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspSettlement_tenantId_idx" ON "MspSettlement"("tenantId")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspSettlement_tenantId_date_idx" ON "MspSettlement"("tenantId","settlementDate")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspSettlement_tenantId_partner_idx" ON "MspSettlement"("tenantId","partnerId")');

    await this.prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "MspHawalaPartner" ("id" UUID NOT NULL DEFAULT uuid_generate_v4(), "tenantId" TEXT NOT NULL, "name" TEXT NOT NULL, "phone" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MspHawalaPartner_pkey" PRIMARY KEY ("id"))'
    );
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspHawalaPartner_tenantId_idx" ON "MspHawalaPartner"("tenantId")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspHawalaPartner_tenantId_active_idx" ON "MspHawalaPartner"("tenantId","isActive")');

    await this.prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "MspHawalaTransfer" ("id" UUID NOT NULL DEFAULT uuid_generate_v4(), "tenantId" TEXT NOT NULL, "transferNumber" INTEGER NOT NULL, "status" TEXT NOT NULL DEFAULT \'open\', "transferDate" DATE NOT NULL DEFAULT CURRENT_DATE, "currencyCode" TEXT NOT NULL, "amount" DECIMAL(20,6) NOT NULL, "fee" DECIMAL(20,6) NOT NULL DEFAULT 0, "total" DECIMAL(20,6) NOT NULL, "senderName" TEXT NOT NULL, "senderPhone" TEXT, "receiverName" TEXT NOT NULL, "receiverPhone" TEXT, "partnerId" UUID, "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdByUserId" TEXT, CONSTRAINT "MspHawalaTransfer_pkey" PRIMARY KEY ("id"))'
    );
    await this.prisma.$executeRawUnsafe('ALTER TABLE "MspHawalaTransfer" ADD COLUMN IF NOT EXISTS "receiveAccountId" UUID');
    await this.prisma.$executeRawUnsafe('ALTER TABLE "MspHawalaTransfer" ADD COLUMN IF NOT EXISTS "customerId" UUID');
    await this.prisma.$executeRawUnsafe('ALTER TABLE "MspHawalaTransfer" ADD COLUMN IF NOT EXISTS "fundingSource" TEXT');
    await this.prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "MspHawalaTransfer_tenantId_transferNumber_key" ON "MspHawalaTransfer"("tenantId","transferNumber")'
    );
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspHawalaTransfer_tenantId_date_idx" ON "MspHawalaTransfer"("tenantId","transferDate")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspHawalaTransfer_tenantId_status_idx" ON "MspHawalaTransfer"("tenantId","status")');

    await this.prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "MspHawalaPayout" ("id" UUID NOT NULL DEFAULT uuid_generate_v4(), "tenantId" TEXT NOT NULL, "transferId" UUID NOT NULL, "paidAmount" DECIMAL(20,6) NOT NULL, "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "paidByUserId" TEXT, "note" TEXT, CONSTRAINT "MspHawalaPayout_pkey" PRIMARY KEY ("id"))'
    );
    await this.prisma.$executeRawUnsafe('ALTER TABLE "MspHawalaPayout" ADD COLUMN IF NOT EXISTS "payAccountId" UUID');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspHawalaPayout_tenantId_transferId_idx" ON "MspHawalaPayout"("tenantId","transferId")');

    await this.prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "MspAmlAlert" ("id" UUID NOT NULL DEFAULT uuid_generate_v4(), "tenantId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "status" TEXT NOT NULL DEFAULT \'open\', "ruleCode" TEXT NOT NULL, "severity" TEXT NOT NULL DEFAULT \'medium\', "title" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "sourceType" TEXT NOT NULL, "sourceId" UUID, "customerId" UUID, "currencyCode" TEXT, "amount" DECIMAL(20,6), "detailsJson" JSONB, "closedAt" TIMESTAMP(3), "closedByUserId" TEXT, "closeNote" TEXT, CONSTRAINT "MspAmlAlert_pkey" PRIMARY KEY ("id"))'
    );
    await this.prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "MspAmlAlert_tenant_fingerprint_uq" ON "MspAmlAlert"("tenantId","fingerprint")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspAmlAlert_tenant_status_idx" ON "MspAmlAlert"("tenantId","status")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspAmlAlert_tenant_createdAt_idx" ON "MspAmlAlert"("tenantId","createdAt")');
    await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "MspAmlAlert_tenant_customer_idx" ON "MspAmlAlert"("tenantId","customerId")');
  }

  private async ensureMspDefaults(tenantId: string): Promise<void> {
    await this.ensureMspTables();

    await this.prisma.$executeRaw`
      INSERT INTO "MspSettings" ("tenantId","baseCurrencyCode","updatedAt","nextExchangeTicketNumber")
      VALUES (${tenantId}, 'AFN', NOW(), 1)
      ON CONFLICT ("tenantId") DO NOTHING
    `;

    await this.prisma.$executeRaw`
      UPDATE "MspSettings" SET "nextHawalaTransferNumber"=COALESCE("nextHawalaTransferNumber",1)
      WHERE "tenantId"=${tenantId}
    `;

    await this.prisma.$executeRaw`
      INSERT INTO "MspCurrency" ("tenantId","code","name","symbol","decimals","isActive","createdAt","updatedAt")
      VALUES
        (${tenantId}, 'AFN', 'Afghani', '؋', 2, TRUE, NOW(), NOW()),
        (${tenantId}, 'USD', 'US Dollar', '$', 2, TRUE, NOW(), NOW()),
        (${tenantId}, 'EUR', 'Euro', '€', 2, TRUE, NOW(), NOW()),
        (${tenantId}, 'PKR', 'Pakistani Rupee', '₨', 2, TRUE, NOW(), NOW()),
        (${tenantId}, 'IRR', 'Iranian Rial', '﷼', 2, TRUE, NOW(), NOW()),
        (${tenantId}, 'AED', 'UAE Dirham', 'د.إ', 2, TRUE, NOW(), NOW())
      ON CONFLICT ("tenantId","code") DO NOTHING
    `;
  }

  private parseIsoDateOnly(raw: string | undefined, fallbackToday = true): string {
    if (raw && raw.trim()) {
      const s = raw.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      }
      const d = new Date(s + "T00:00:00.000Z");
      if (!Number.isFinite(d.getTime())) {
        throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      }
      return s;
    }
    if (!fallbackToday) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }
    return new Date().toISOString().slice(0, 10);
  }

  private normalizeMoneyInput(raw: string, allowZero = false): Prisma.Decimal {
    const s = (raw ?? "").trim();
    if (!s) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    let d: Prisma.Decimal;
    try {
      d = new Prisma.Decimal(s);
    } catch {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }
    if (allowZero ? d.lt(0) : d.lte(0)) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }
    return d;
  }

  private defaultCompliancePolicy(): {
    kyc: { enforceMode: "always" | "above_threshold"; requireCustomerAboveThreshold: boolean; requiredAboveByCurrency: Record<string, string> };
    aml: { largeTxThresholdByCurrency: Record<string, string>; structuringWindowHours: number; structuringMinCount: number };
  } {
    const thresholds: Record<string, string> = { AFN: "100000", USD: "1000", EUR: "1000", AED: "3000", PKR: "200000", IRR: "50000000" };
    return {
      kyc: { enforceMode: "always", requireCustomerAboveThreshold: true, requiredAboveByCurrency: { ...thresholds } },
      aml: { largeTxThresholdByCurrency: { ...thresholds }, structuringWindowHours: 24, structuringMinCount: 3 }
    };
  }

  private parseDecimalFromPolicy(map: Record<string, string> | undefined, currencyCode: string, fallback: Prisma.Decimal): Prisma.Decimal {
    const code = (currencyCode ?? "").trim().toUpperCase();
    const raw = map?.[code];
    if (!raw) return fallback;
    try {
      const d = new Prisma.Decimal(String(raw).trim());
      if (!d.isFinite() || d.lte(0)) return fallback;
      return d;
    } catch {
      return fallback;
    }
  }

  private async getCompliancePolicyFromDb(queryRaw: PrismaService["$queryRaw"], tenantId: string) {
    const defaults = this.defaultCompliancePolicy();
    const row = (
      await queryRaw<Array<{ complianceJson: unknown | null }>>(Prisma.sql`
        SELECT "complianceJson" FROM "MspSettings" WHERE "tenantId"=${tenantId} LIMIT 1
      `)
    )[0];
    const raw = row?.complianceJson && typeof row.complianceJson === "object" ? (row.complianceJson as Record<string, unknown>) : null;
    const rawKyc = raw?.kyc && typeof raw.kyc === "object" ? (raw.kyc as Record<string, unknown>) : null;
    const rawAml = raw?.aml && typeof raw.aml === "object" ? (raw.aml as Record<string, unknown>) : null;

    const enforceMode = rawKyc?.enforceMode === "above_threshold" || rawKyc?.enforceMode === "always" ? (rawKyc.enforceMode as "always" | "above_threshold") : defaults.kyc.enforceMode;
    const requireCustomerAboveThreshold =
      typeof rawKyc?.requireCustomerAboveThreshold === "boolean" ? (rawKyc.requireCustomerAboveThreshold as boolean) : defaults.kyc.requireCustomerAboveThreshold;

    const requiredAboveByCurrency: Record<string, string> = { ...defaults.kyc.requiredAboveByCurrency };
    if (rawKyc?.requiredAboveByCurrency && typeof rawKyc.requiredAboveByCurrency === "object") {
      for (const [k, v] of Object.entries(rawKyc.requiredAboveByCurrency as Record<string, unknown>)) {
        if (!k) continue;
        const code = k.trim().toUpperCase();
        if (!code) continue;
        if (typeof v !== "string" && typeof v !== "number") continue;
        const s = String(v).trim();
        if (!s) continue;
        requiredAboveByCurrency[code] = s;
      }
    }

    const largeTxThresholdByCurrency: Record<string, string> = { ...defaults.aml.largeTxThresholdByCurrency };
    if (rawAml?.largeTxThresholdByCurrency && typeof rawAml.largeTxThresholdByCurrency === "object") {
      for (const [k, v] of Object.entries(rawAml.largeTxThresholdByCurrency as Record<string, unknown>)) {
        if (!k) continue;
        const code = k.trim().toUpperCase();
        if (!code) continue;
        if (typeof v !== "string" && typeof v !== "number") continue;
        const s = String(v).trim();
        if (!s) continue;
        largeTxThresholdByCurrency[code] = s;
      }
    }

    const structuringWindowHours = typeof rawAml?.structuringWindowHours === "number" && Number.isFinite(rawAml.structuringWindowHours) ? rawAml.structuringWindowHours : defaults.aml.structuringWindowHours;
    const structuringMinCount = typeof rawAml?.structuringMinCount === "number" && Number.isFinite(rawAml.structuringMinCount) ? rawAml.structuringMinCount : defaults.aml.structuringMinCount;

    return {
      kyc: { enforceMode, requireCustomerAboveThreshold, requiredAboveByCurrency },
      aml: {
        largeTxThresholdByCurrency,
        structuringWindowHours: Math.min(168, Math.max(1, Math.floor(structuringWindowHours))),
        structuringMinCount: Math.min(50, Math.max(2, Math.floor(structuringMinCount)))
      }
    };
  }

  private async createAmlAlert(
    tx: { $queryRaw: PrismaService["$queryRaw"] },
    args: {
      tenantId: string;
      fingerprint: string;
      ruleCode: string;
      severity: "low" | "medium" | "high";
      title: string;
      sourceType: string;
      sourceId: string | null;
      customerId: string | null;
      currencyCode: string | null;
      amount: Prisma.Decimal | null;
      details: Record<string, unknown>;
    }
  ): Promise<void> {
    const detailsJson = JSON.stringify(args.details ?? {});
    await tx.$queryRaw`
      INSERT INTO "MspAmlAlert" ("tenantId","status","ruleCode","severity","title","fingerprint","sourceType","sourceId","customerId","currencyCode","amount","detailsJson")
      VALUES (
        ${args.tenantId},
        'open',
        ${args.ruleCode},
        ${args.severity},
        ${args.title},
        ${args.fingerprint},
        ${args.sourceType},
        ${args.sourceId}::uuid,
        ${args.customerId}::uuid,
        ${args.currencyCode},
        ${args.amount},
        ${detailsJson}::jsonb
      )
      ON CONFLICT DO NOTHING
    `;
  }

  private async evaluateAmlForCustomerTxn(
    tx: { $queryRaw: PrismaService["$queryRaw"] },
    args: {
      tenantId: string;
      sourceType: "exchange_ticket" | "hawala_transfer";
      sourceId: string;
      txnDate: string;
      customerId: string;
      currencyCode: string;
      amount: Prisma.Decimal;
    }
  ): Promise<void> {
    const policy = await this.getCompliancePolicyFromDb(tx.$queryRaw, args.tenantId);
    const threshold = this.parseDecimalFromPolicy(policy.aml.largeTxThresholdByCurrency, args.currencyCode, new Prisma.Decimal("10000"));
    const windowHours = policy.aml.structuringWindowHours;
    const minCount = policy.aml.structuringMinCount;

    if (args.amount.gte(threshold)) {
      await this.createAmlAlert(tx, {
        tenantId: args.tenantId,
        fingerprint: `large:${args.sourceType}:${args.sourceId}`,
        ruleCode: "large_tx",
        severity: "high",
        title: `Large transaction (${args.currencyCode} ${args.amount.toString()})`,
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        customerId: args.customerId,
        currencyCode: args.currencyCode,
        amount: args.amount,
        details: { threshold: threshold.toString(), txnDate: args.txnDate }
      });
    }

    const customer = (
      await tx.$queryRaw<Array<{ kycJson: unknown | null }>>(Prisma.sql`
        SELECT "kycJson" FROM "MspCustomer"
        WHERE "tenantId"=${args.tenantId} AND "id"=${args.customerId}::uuid
        LIMIT 1
      `)
    )[0];
    const profile = customer?.kycJson && typeof customer.kycJson === "object" ? (customer.kycJson as Record<string, unknown>) : null;
    const isPep = typeof profile?.isPep === "boolean" ? (profile.isPep as boolean) : false;
    const riskLevel = typeof profile?.riskLevel === "string" ? ((profile.riskLevel as string) || "").toLowerCase() : "";
    if (isPep) {
      await this.createAmlAlert(tx, {
        tenantId: args.tenantId,
        fingerprint: `pep:${args.sourceType}:${args.sourceId}`,
        ruleCode: "pep",
        severity: "high",
        title: `PEP customer transaction (${args.currencyCode} ${args.amount.toString()})`,
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        customerId: args.customerId,
        currencyCode: args.currencyCode,
        amount: args.amount,
        details: { txnDate: args.txnDate }
      });
    } else if (riskLevel === "high") {
      await this.createAmlAlert(tx, {
        tenantId: args.tenantId,
        fingerprint: `high_risk:${args.sourceType}:${args.sourceId}`,
        ruleCode: "high_risk",
        severity: "medium",
        title: `High-risk customer transaction (${args.currencyCode} ${args.amount.toString()})`,
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        customerId: args.customerId,
        currencyCode: args.currencyCode,
        amount: args.amount,
        details: { txnDate: args.txnDate }
      });
    }

    const agg = (
      await tx.$queryRaw<Array<{ cnt: bigint; total: Prisma.Decimal; maxAmount: Prisma.Decimal }>>(Prisma.sql`
        SELECT
          COUNT(*)::bigint AS "cnt",
          COALESCE(SUM(s."amount"),0)::decimal(20,6) AS "total",
          COALESCE(MAX(s."amount"),0)::decimal(20,6) AS "maxAmount"
        FROM (
          SELECT (t."baseAmount" + t."feeBase")::decimal(20,6) AS "amount"
          FROM "MspExchangeTicket" t
          WHERE t."tenantId"=${args.tenantId}
            AND t."customerId"=${args.customerId}::uuid
            AND t."baseCode"=${args.currencyCode}
            AND t."createdAt" >= NOW() - make_interval(hours => ${windowHours})
          UNION ALL
          SELECT h."total"::decimal(20,6) AS "amount"
          FROM "MspHawalaTransfer" h
          WHERE h."tenantId"=${args.tenantId}
            AND h."customerId"=${args.customerId}::uuid
            AND h."currencyCode"=${args.currencyCode}
            AND h."createdAt" >= NOW() - make_interval(hours => ${windowHours})
        ) s
      `)
    )[0];
    const count = Number(agg?.cnt ?? 0);
    const total = new Prisma.Decimal(agg?.total ?? 0);
    const maxAmount = new Prisma.Decimal(agg?.maxAmount ?? 0);
    if (count >= minCount && total.gte(threshold) && maxAmount.lt(threshold)) {
      await this.createAmlAlert(tx, {
        tenantId: args.tenantId,
        fingerprint: `structuring_${windowHours}h:${args.customerId}:${args.currencyCode}:${args.txnDate}`,
        ruleCode: "structuring_24h",
        severity: "high",
        title: `Possible structuring (${windowHours}h) (${args.currencyCode} ${total.toString()})`,
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        customerId: args.customerId,
        currencyCode: args.currencyCode,
        amount: total,
        details: { threshold: threshold.toString(), count, minCount, windowHours, total: total.toString(), max: maxAmount.toString(), txnDate: args.txnDate }
      });
    }
  }

  private async assertActiveCurrency(tenantId: string, code: string): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "MspCurrency" WHERE "tenantId"=${tenantId} AND "code"=${code} AND "isActive"=TRUE LIMIT 1
    `;
    if (rows.length === 0) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }
  }

  private async getAccount(tenantId: string, accountId: string): Promise<{ id: string; type: string; name: string; currencyCode: string; isActive: boolean }> {
    const row = (
      await this.prisma.$queryRaw<
        Array<{ id: string; type: string; name: string; currencyCode: string; isActive: boolean }>
      >`SELECT "id","type","name","currencyCode","isActive" FROM "MspAccount" WHERE "tenantId"=${tenantId} AND "id"=${accountId}::uuid LIMIT 1`
    )[0];
    if (!row) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    return row;
  }

  private async getAccountMeta(
    tenantId: string,
    accountId: string
  ): Promise<{
    id: string;
    type: string;
    name: string;
    currencyCode: string;
    isActive: boolean;
    customerId: string | null;
    partnerId: string | null;
    systemCode: string | null;
  }> {
    const row = (
      await this.prisma.$queryRaw<
        Array<{ id: string; type: string; name: string; currencyCode: string; isActive: boolean; customerId: string | null; partnerId: string | null; systemCode: string | null }>
      >`SELECT "id","type","name","currencyCode","isActive","customerId"::text AS "customerId","partnerId"::text AS "partnerId","systemCode" FROM "MspAccount" WHERE "tenantId"=${tenantId} AND "id"=${accountId}::uuid LIMIT 1`
    )[0];
    if (!row) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    return row;
  }

  private async assertActiveAccount(tenantId: string, accountId: string, currencyCode?: string): Promise<{ id: string; type: string; name: string; currencyCode: string }> {
    const acc = await this.getAccount(tenantId, accountId);
    if (!acc.isActive) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    if (currencyCode && acc.currencyCode !== currencyCode) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    return { id: acc.id, type: acc.type, name: acc.name, currencyCode: acc.currencyCode };
  }

  private async assertActiveCashBankAccount(tenantId: string, accountId: string, currencyCode?: string): Promise<{ id: string; type: "cash" | "bank"; name: string; currencyCode: string }> {
    const acc = await this.getAccountMeta(tenantId, accountId);
    if (acc.type !== "cash" && acc.type !== "bank") {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }
    if (!acc.isActive) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    if (currencyCode && acc.currencyCode !== currencyCode) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    return { id: acc.id, type: acc.type, name: acc.name, currencyCode: acc.currencyCode };
  }

  private async getCustomer(tenantId: string, customerId: string): Promise<{ id: string; name: string; isActive: boolean }> {
    const row = (await this.prisma.$queryRaw<Array<{ id: string; name: string; isActive: boolean }>>`
      SELECT "id","name","isActive" FROM "MspCustomer" WHERE "tenantId"=${tenantId} AND "id"=${customerId}::uuid LIMIT 1
    `)[0];
    if (!row) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    return row;
  }

  private async getOrCreateCustomerWalletAccount(
    tx: { $queryRaw: PrismaService["$queryRaw"] },
    args: { tenantId: string; customerId: string; currencyCode: string; userId: string }
  ): Promise<string> {
    const existing = (await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "MspAccount"
      WHERE "tenantId"=${args.tenantId} AND "type"='customer' AND "customerId"=${args.customerId}::uuid AND "currencyCode"=${args.currencyCode}
      LIMIT 1
    `)[0];
    if (existing?.id) return existing.id;

    const created = (await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "MspAccount" ("tenantId","type","name","currencyCode","branchId","customerId","systemCode","isActive","createdAt","updatedAt","createdByUserId","updatedByUserId")
      VALUES (${args.tenantId}, 'customer', 'Customer wallet', ${args.currencyCode}, NULL, ${args.customerId}::uuid, NULL, TRUE, NOW(), NOW(), ${args.userId}, ${args.userId})
      ON CONFLICT DO NOTHING
      RETURNING "id"
    `)[0];
    if (created?.id) return created.id;

    const retry = (await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "MspAccount"
      WHERE "tenantId"=${args.tenantId} AND "type"='customer' AND "customerId"=${args.customerId}::uuid AND "currencyCode"=${args.currencyCode}
      LIMIT 1
    `)[0];
    if (!retry?.id) throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);
    return retry.id;
  }

  private async getOrCreatePartnerAccount(
    tx: { $queryRaw: PrismaService["$queryRaw"] },
    args: { tenantId: string; partnerId: string; partnerName: string; currencyCode: string; userId: string }
  ): Promise<string> {
    const existing = (await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "MspAccount"
      WHERE "tenantId"=${args.tenantId} AND "type"='partner' AND "partnerId"=${args.partnerId}::uuid AND "currencyCode"=${args.currencyCode}
      LIMIT 1
    `)[0];
    if (existing?.id) return existing.id;

    const created = (await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "MspAccount" ("tenantId","type","name","currencyCode","branchId","customerId","partnerId","systemCode","isActive","createdAt","updatedAt","createdByUserId","updatedByUserId")
      VALUES (${args.tenantId}, 'partner', ${`Partner — ${args.partnerName}`}, ${args.currencyCode}, NULL, NULL, ${args.partnerId}::uuid, NULL, TRUE, NOW(), NOW(), ${args.userId}, ${args.userId})
      ON CONFLICT DO NOTHING
      RETURNING "id"
    `)[0];
    if (created?.id) return created.id;

    const retry = (await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "MspAccount"
      WHERE "tenantId"=${args.tenantId} AND "type"='partner' AND "partnerId"=${args.partnerId}::uuid AND "currencyCode"=${args.currencyCode}
      LIMIT 1
    `)[0];
    if (!retry?.id) throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);
    return retry.id;
  }

  private async getOrCreateSystemAccount(
    tx: { $queryRaw: PrismaService["$queryRaw"] },
    args: { tenantId: string; systemCode: string; currencyCode: string; name: string; userId: string }
  ): Promise<string> {
    const existing = (await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "MspAccount"
      WHERE "tenantId"=${args.tenantId} AND "systemCode"=${args.systemCode} AND "currencyCode"=${args.currencyCode}
      LIMIT 1
    `)[0];
    if (existing?.id) return existing.id;

    const created = (await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "MspAccount" ("tenantId","type","name","currencyCode","branchId","customerId","systemCode","isActive","createdAt","updatedAt","createdByUserId","updatedByUserId")
      VALUES (${args.tenantId}, 'system', ${args.name}, ${args.currencyCode}, NULL, NULL, ${args.systemCode}, TRUE, NOW(), NOW(), ${args.userId}, ${args.userId})
      ON CONFLICT DO NOTHING
      RETURNING "id"
    `)[0];
    if (created?.id) return created.id;

    const retry = (await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "MspAccount"
      WHERE "tenantId"=${args.tenantId} AND "systemCode"=${args.systemCode} AND "currencyCode"=${args.currencyCode}
      LIMIT 1
    `)[0];
    if (!retry?.id) throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);
    return retry.id;
  }

  private async insertLedgerEntry(
    tx: { $queryRaw: PrismaService["$queryRaw"] },
    args: { tenantId: string; accountId: string; entryDate: string; source: string; ref: string | null; amountSigned: Prisma.Decimal; note: string | null; userId: string }
  ): Promise<string> {
    const created = (await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "MspLedgerEntry" ("tenantId","accountId","entryDate","occurredAt","source","ref","amountSigned","note","createdAt","createdByUserId")
      VALUES (${args.tenantId}, ${args.accountId}::uuid, ${args.entryDate}::date, NOW(), ${args.source}, ${args.ref}, ${args.amountSigned}, ${args.note}, NOW(), ${args.userId})
      RETURNING "id"
    `)[0];
    if (!created?.id) throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);
    return created.id;
  }

  private async getAccountBalance(tx: { $queryRaw: PrismaService["$queryRaw"] }, tenantId: string, accountId: string): Promise<Prisma.Decimal> {
    const row = (await tx.$queryRaw<Array<{ balance: Prisma.Decimal }>>`
      SELECT COALESCE(SUM("amountSigned"),0)::decimal(20,6) AS "balance"
      FROM "MspLedgerEntry"
      WHERE "tenantId"=${tenantId} AND "accountId"=${accountId}::uuid
    `)[0];
    return row?.balance ?? new Prisma.Decimal(0);
  }

  private async assertSufficientBalance(
    tx: { $queryRaw: PrismaService["$queryRaw"] },
    tenantId: string,
    accountId: string,
    requiredOut: Prisma.Decimal
  ): Promise<void> {
    const balance = await this.getAccountBalance(tx, tenantId, accountId);
    if (balance.lt(requiredOut)) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.insufficientBalance" } }, 400);
    }
  }

  private async getFxPosition(
    tx: { $queryRaw: PrismaService["$queryRaw"] },
    args: { tenantId: string; currencyCode: string; valuationCurrencyCode: string }
  ): Promise<{ qty: Prisma.Decimal; totalCostValuation: Prisma.Decimal }> {
    const row = (await tx.$queryRaw<Array<{ qty: Prisma.Decimal; totalCostValuation: Prisma.Decimal }>>`
      SELECT
        COALESCE("qty",0)::decimal(20,6) AS "qty",
        COALESCE("totalCostValuation",0)::decimal(20,6) AS "totalCostValuation"
      FROM "MspFxPosition"
      WHERE "tenantId"=${args.tenantId} AND "currencyCode"=${args.currencyCode} AND "valuationCurrencyCode"=${args.valuationCurrencyCode}
      LIMIT 1
    `)[0];
    return { qty: row?.qty ?? new Prisma.Decimal(0), totalCostValuation: row?.totalCostValuation ?? new Prisma.Decimal(0) };
  }

  private async upsertFxPosition(
    tx: { $queryRaw: PrismaService["$queryRaw"] },
    args: { tenantId: string; currencyCode: string; valuationCurrencyCode: string; qty: Prisma.Decimal; totalCostValuation: Prisma.Decimal }
  ): Promise<void> {
    await tx.$queryRaw`
      INSERT INTO "MspFxPosition" ("tenantId","currencyCode","valuationCurrencyCode","qty","totalCostValuation","updatedAt")
      VALUES (${args.tenantId}, ${args.currencyCode}, ${args.valuationCurrencyCode}, ${args.qty}, ${args.totalCostValuation}, NOW())
      ON CONFLICT ("tenantId","currencyCode","valuationCurrencyCode")
      DO UPDATE SET "qty"=EXCLUDED."qty", "totalCostValuation"=EXCLUDED."totalCostValuation", "updatedAt"=NOW()
    `;
  }

  private async applyFxWacFromExchangeTicket(
    tx: { $queryRaw: PrismaService["$queryRaw"] },
    args: {
      tenantId: string;
      ticketId: string;
      type: "buy" | "sell";
      baseCode: string;
      quoteCode: string;
      quoteAmount: Prisma.Decimal;
      baseAmount: Prisma.Decimal;
      feeBase: Prisma.Decimal;
    }
  ): Promise<{ realizedProfitValuation: Prisma.Decimal; costOfSoldValuation: Prisma.Decimal }> {
    const valuationCurrencyCode = args.baseCode;
    const pos = await this.getFxPosition(tx, { tenantId: args.tenantId, currencyCode: args.quoteCode, valuationCurrencyCode });

    if (args.type === "buy") {
      const cost = args.baseAmount.add(args.feeBase);
      const qty = pos.qty.add(args.quoteAmount);
      const totalCostValuation = pos.totalCostValuation.add(cost);
      await this.upsertFxPosition(tx, { tenantId: args.tenantId, currencyCode: args.quoteCode, valuationCurrencyCode, qty, totalCostValuation });
      await tx.$queryRaw`
        UPDATE "MspExchangeTicket"
        SET "valuationCurrencyCode"=${valuationCurrencyCode}, "realizedProfitValuation"=0, "costOfSoldValuation"=0
        WHERE "tenantId"=${args.tenantId} AND "id"=${args.ticketId}::uuid
      `;
      return { realizedProfitValuation: new Prisma.Decimal(0), costOfSoldValuation: new Prisma.Decimal(0) };
    }

    const avgCost = pos.qty.gt(0) ? pos.totalCostValuation.div(pos.qty) : new Prisma.Decimal(0);
    const costOfSold = avgCost.mul(args.quoteAmount);
    const proceeds = args.baseAmount.add(args.feeBase);
    const profit = proceeds.sub(costOfSold);
    const qty = pos.qty.sub(args.quoteAmount);
    const totalCostValuation = pos.totalCostValuation.sub(costOfSold);
    await this.upsertFxPosition(tx, { tenantId: args.tenantId, currencyCode: args.quoteCode, valuationCurrencyCode, qty, totalCostValuation });
    await tx.$queryRaw`
      UPDATE "MspExchangeTicket"
      SET "valuationCurrencyCode"=${valuationCurrencyCode}, "realizedProfitValuation"=${profit}, "costOfSoldValuation"=${costOfSold}
      WHERE "tenantId"=${args.tenantId} AND "id"=${args.ticketId}::uuid
    `;
    return { realizedProfitValuation: profit, costOfSoldValuation: costOfSold };
  }

  private toInt(raw: string | number | undefined, fallback: number): number {
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  }

  private parseDateTimeOrNull(raw: string | undefined): Date | null {
    if (!raw?.trim()) return null;
    const d = new Date(raw.trim());
    if (!Number.isFinite(d.getTime())) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }
    return d;
  }

  private parseIsoDateOnlyOrNull(raw: string | undefined): string | null {
    if (!raw?.trim()) return null;
    return this.parseIsoDateOnly(raw, false);
  }

  @Get("dashboard")
  @RequirePermissions("msp.dashboard.view")
  async dashboard(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const [customersRow, partnersRow, branchesRow] = await Promise.all([
      this.prisma.$queryRaw<Array<{ total: bigint }>>`SELECT COUNT(*)::bigint AS "total" FROM "MspCustomer" WHERE "tenantId"=${tenantId}`,
      this.prisma.$queryRaw<Array<{ total: bigint }>>`SELECT COUNT(*)::bigint AS "total" FROM "MspHawalaPartner" WHERE "tenantId"=${tenantId}`,
      this.prisma.$queryRaw<Array<{ total: bigint }>>`SELECT COUNT(*)::bigint AS "total" FROM "MspBranch" WHERE "tenantId"=${tenantId}`
    ]);

    return {
      data: {
        kpis: {
          customers: Number(customersRow?.[0]?.total ?? 0),
          partners: Number(partnersRow?.[0]?.total ?? 0),
          branches: Number(branchesRow?.[0]?.total ?? 0)
        }
      }
    };
  }

  @Get("settings")
  @RequirePermissions("msp.settings.view")
  async getSettings(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const row = (await this.prisma.$queryRaw<
      Array<{ baseCurrencyCode: string; updatedAt: Date }>
    >`SELECT "baseCurrencyCode","updatedAt" FROM "MspSettings" WHERE "tenantId" = ${tenantId} LIMIT 1`)[0];

    const policy = await this.getCompliancePolicyFromDb(this.prisma.$queryRaw, tenantId);
    return {
      data: {
        baseCurrencyCode: row?.baseCurrencyCode ?? "AFN",
        compliance: {
          kyc: {
            enforceMode: policy.kyc.enforceMode,
            requireCustomerAboveThreshold: policy.kyc.requireCustomerAboveThreshold,
            requiredAbove: Object.entries(policy.kyc.requiredAboveByCurrency).map(([currencyCode, amount]) => ({ currencyCode, amount }))
          },
          aml: {
            largeTx: Object.entries(policy.aml.largeTxThresholdByCurrency).map(([currencyCode, amount]) => ({ currencyCode, amount })),
            structuringWindowHours: policy.aml.structuringWindowHours,
            structuringMinCount: policy.aml.structuringMinCount
          }
        }
      }
    };
  }

  @Patch("settings")
  @RequirePermissions("msp.settings.manage")
  async updateSettings(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: UpdateMspSettingsDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const updates: Prisma.Sql[] = [];

    if (body.baseCurrencyCode !== undefined) {
      const code = body.baseCurrencyCode.trim().toUpperCase();
      if (!code) {
        throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      }

      const exists = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "MspCurrency" WHERE "tenantId"=${tenantId} AND "code"=${code} AND "isActive"=TRUE LIMIT 1
      `;
      if (exists.length === 0) {
        throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      }
      updates.push(Prisma.sql`"baseCurrencyCode"=${code}`);
    }

    if (body.compliance) {
      const current = await this.getCompliancePolicyFromDb(this.prisma.$queryRaw, tenantId);
      const next = {
        kyc: { ...current.kyc, requiredAboveByCurrency: { ...current.kyc.requiredAboveByCurrency } },
        aml: { ...current.aml, largeTxThresholdByCurrency: { ...current.aml.largeTxThresholdByCurrency } }
      };

      if (body.compliance.kyc) {
        if (body.compliance.kyc.enforceMode) next.kyc.enforceMode = body.compliance.kyc.enforceMode;
        if (body.compliance.kyc.requireCustomerAboveThreshold !== undefined) next.kyc.requireCustomerAboveThreshold = body.compliance.kyc.requireCustomerAboveThreshold;
        if (Array.isArray(body.compliance.kyc.requiredAbove)) {
          for (const it of body.compliance.kyc.requiredAbove) {
            const code = (it.currencyCode ?? "").trim().toUpperCase();
            const amt = (it.amount ?? "").trim();
            if (!code || !amt) continue;
            next.kyc.requiredAboveByCurrency[code] = amt;
          }
        }
      }

      if (body.compliance.aml) {
        if (Array.isArray(body.compliance.aml.largeTx)) {
          for (const it of body.compliance.aml.largeTx) {
            const code = (it.currencyCode ?? "").trim().toUpperCase();
            const amt = (it.amount ?? "").trim();
            if (!code || !amt) continue;
            next.aml.largeTxThresholdByCurrency[code] = amt;
          }
        }
        if (typeof body.compliance.aml.structuringWindowHours === "number") next.aml.structuringWindowHours = body.compliance.aml.structuringWindowHours;
        if (typeof body.compliance.aml.structuringMinCount === "number") next.aml.structuringMinCount = body.compliance.aml.structuringMinCount;
      }

      updates.push(Prisma.sql`"complianceJson"=${JSON.stringify(next)}::jsonb`);
    }

    if (updates.length === 0) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    await this.prisma.$executeRaw`
      UPDATE "MspSettings"
      SET ${Prisma.join([...updates, Prisma.sql`"updatedAt"=NOW()`], ", ")}
      WHERE "tenantId"=${tenantId}
    `;
    return { data: { success: true } };
  }

  @Get("currencies")
  @RequirePermissions("msp.settings.view")
  async listCurrencies(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const currencies = await this.prisma.$queryRaw<
      Array<{ id: string; code: string; name: string; symbol: string | null; decimals: number; isActive: boolean; updatedAt: Date }>
    >`SELECT "id","code","name","symbol","decimals","isActive","updatedAt" FROM "MspCurrency" WHERE "tenantId"=${tenantId} ORDER BY "code" ASC`;

    return { data: currencies.map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() })) };
  }

  @Post("currencies")
  @RequirePermissions("msp.settings.manage")
  async upsertCurrency(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: CreateMspCurrencyDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const code = body.code.trim().toUpperCase();
    const name = body.name.trim();
    if (!code || !name) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const symbol = body.symbol?.trim() ? body.symbol.trim() : null;
    const decimals = typeof body.decimals === "number" ? body.decimals : 2;
    const isActive = typeof body.isActive === "boolean" ? body.isActive : true;

    const row = (
      await this.prisma.$queryRaw<
        Array<{ id: string }>
      >`SELECT "id" FROM "MspCurrency" WHERE "tenantId"=${tenantId} AND "code"=${code} LIMIT 1`
    )[0];

    if (!row?.id) {
      await this.prisma.$executeRaw`
        INSERT INTO "MspCurrency" ("tenantId","code","name","symbol","decimals","isActive","createdAt","updatedAt")
        VALUES (${tenantId}, ${code}, ${name}, ${symbol}, ${decimals}, ${isActive}, NOW(), NOW())
      `;
    } else {
      await this.prisma.$executeRaw`
        UPDATE "MspCurrency"
        SET "name"=${name}, "symbol"=${symbol}, "decimals"=${decimals}, "isActive"=${isActive}, "updatedAt"=NOW()
        WHERE "tenantId"=${tenantId} AND "code"=${code}
      `;
    }

    return { data: { success: true } };
  }

  @Patch("currencies/:code")
  @RequirePermissions("msp.settings.manage")
  async updateCurrency(@Req() req: { tenantId: string }, @Param("code") codeParam: string, @Body() body: UpdateMspCurrencyDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const code = (codeParam ?? "").trim().toUpperCase();
    if (!code) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const existing = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "MspCurrency" WHERE "tenantId"=${tenantId} AND "code"=${code} LIMIT 1
    `;
    if (existing.length === 0) {
      throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }

    const updates: Prisma.Sql[] = [];
    if (body.name !== undefined) updates.push(Prisma.sql`"name"=${body.name.trim()}`);
    if (body.symbol !== undefined) updates.push(Prisma.sql`"symbol"=${body.symbol?.trim() ? body.symbol.trim() : null}`);
    if (body.decimals !== undefined) updates.push(Prisma.sql`"decimals"=${body.decimals}`);
    if (body.isActive !== undefined) updates.push(Prisma.sql`"isActive"=${body.isActive}`);
    updates.push(Prisma.sql`"updatedAt"=NOW()`);

    await this.prisma.$executeRaw`
      UPDATE "MspCurrency" SET ${Prisma.join(updates, ", ")}
      WHERE "tenantId"=${tenantId} AND "code"=${code}
    `;

    return { data: { success: true } };
  }

  @Get("accounts")
  @RequirePermissions("msp.cash.view")
  async listAccounts(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; type: string; name: string; currencyCode: string; branchId: string | null; isActive: boolean; updatedAt: Date; balance: Prisma.Decimal }>
    >(Prisma.sql`
      SELECT
        a."id",
        a."type",
        a."name",
        a."currencyCode",
        a."branchId"::text AS "branchId",
        a."isActive",
        a."updatedAt",
        COALESCE(SUM(e."amountSigned"),0)::decimal(20,6) AS "balance"
      FROM "MspAccount" a
      LEFT JOIN "MspLedgerEntry" e ON e."tenantId"=a."tenantId" AND e."accountId"=a."id"
      WHERE a."tenantId"=${tenantId} AND a."type" IN ('cash','bank')
      GROUP BY a."id",a."type",a."name",a."currencyCode",a."branchId",a."isActive",a."updatedAt"
      ORDER BY a."type" ASC, a."currencyCode" ASC, a."name" ASC
    `);

    return {
      data: rows.map((r) => ({
        id: r.id,
        type: r.type,
        name: r.name,
        currencyCode: r.currencyCode,
        branchId: r.branchId,
        isActive: r.isActive,
        updatedAt: r.updatedAt.toISOString(),
        balance: r.balance.toString()
      }))
    };
  }

  @Post("accounts")
  @RequirePermissions("msp.cash.manage")
  async createAccount(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: CreateMspAccountDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const type = body.type;
    const name = body.name.trim();
    const currencyCode = body.currencyCode.trim().toUpperCase();
    const branchId = body.branchId?.trim() ? body.branchId.trim() : null;
    const isActive = typeof body.isActive === "boolean" ? body.isActive : true;

    if (!name) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    await this.assertActiveCurrency(tenantId, currencyCode);

    if (branchId) {
      const b = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "MspBranch" WHERE "tenantId"=${tenantId} AND "id"=${branchId} LIMIT 1
      `;
      if (b.length === 0) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const opening = body.openingBalance !== undefined ? this.normalizeMoneyInput(body.openingBalance, true) : null;

    const createdId = await this.prisma.$transaction(async (tx) => {
      const created = (await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "MspAccount" ("tenantId","type","name","currencyCode","branchId","isActive","createdAt","updatedAt","createdByUserId","updatedByUserId")
        VALUES (${tenantId}, ${type}, ${name}, ${currencyCode}, ${branchId}::uuid, ${isActive}, NOW(), NOW(), ${req.user.id}, ${req.user.id})
        RETURNING "id"
      `)[0];
      if (!created?.id) throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);

      if (opening && !opening.eq(0)) {
        const entryDate = this.parseIsoDateOnly(undefined, true);
        await this.insertLedgerEntry(tx, {
          tenantId,
          accountId: created.id,
          entryDate,
          source: "opening",
          ref: null,
          amountSigned: opening,
          note: null,
          userId: req.user.id
        });
      }

      return created.id;
    });

    await this.prisma.auditLog.create({
      data: { tenantId, actorUserId: req.user.id, action: "msp.account.create", entityType: "mspAccount", entityId: createdId, metadataJson: { type, name, currencyCode, branchId, isActive, openingBalance: opening?.toString() ?? null } }
    });

    return { data: { id: createdId } };
  }

  @Patch("accounts/:id")
  @RequirePermissions("msp.cash.manage")
  async updateAccount(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: UpdateMspAccountDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const existing = await this.getAccountMeta(tenantId, id);
    if (existing.type !== "cash" && existing.type !== "bank") {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const updates: Prisma.Sql[] = [];
    if (body.name !== undefined) updates.push(Prisma.sql`"name"=${body.name.trim()}`);
    if (body.isActive !== undefined) updates.push(Prisma.sql`"isActive"=${body.isActive}`);
    updates.push(Prisma.sql`"updatedAt"=NOW()`);
    updates.push(Prisma.sql`"updatedByUserId"=${req.user.id}`);

    await this.prisma.$executeRaw`
      UPDATE "MspAccount" SET ${Prisma.join(updates, ", ")}
      WHERE "tenantId"=${tenantId} AND "id"=${id}::uuid
    `;

    const updatesJson = {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {})
    };
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: req.user.id,
        action: "msp.account.update",
        entityType: "mspAccount",
        entityId: id,
        metadataJson: { updates: updatesJson } as Prisma.InputJsonValue
      }
    });

    return { data: { success: true } };
  }

  @Post("accounts/transfer")
  @RequirePermissions("msp.cash.manage")
  async transferBetweenAccounts(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: CreateMspAccountTransferDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const fromAccountId = body.fromAccountId.trim();
    const toAccountId = body.toAccountId.trim();
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const amount = this.normalizeMoneyInput(body.amount);
    const entryDate = body.transferDate?.trim() ? this.parseIsoDateOnly(body.transferDate, false) : this.parseIsoDateOnly(undefined, true);
    const note = body.note?.trim() ? body.note.trim() : null;

    const from = await this.assertActiveCashBankAccount(tenantId, fromAccountId);
    const to = await this.assertActiveCashBankAccount(tenantId, toAccountId);
    if (from.currencyCode !== to.currencyCode) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const transferId = await this.prisma.$transaction(async (tx) => {
      const t = (await tx.$queryRaw<Array<{ id: string }>>`SELECT uuid_generate_v4()::text AS "id"`)[0];
      const id = t?.id ?? "";
      if (!id) throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);

      await this.insertLedgerEntry(tx, {
        tenantId,
        accountId: from.id,
        entryDate,
        source: "transfer",
        ref: `transfer:${id}`,
        amountSigned: amount.mul(-1),
        note,
        userId: req.user.id
      });
      await this.insertLedgerEntry(tx, {
        tenantId,
        accountId: to.id,
        entryDate,
        source: "transfer",
        ref: `transfer:${id}`,
        amountSigned: amount,
        note,
        userId: req.user.id
      });

      return id;
    });

    await this.prisma.auditLog.create({
      data: { tenantId, actorUserId: req.user.id, action: "msp.account.transfer", entityType: "mspAccountTransfer", entityId: transferId, metadataJson: { fromAccountId, toAccountId, amount: amount.toString(), entryDate, note } }
    });

    return { data: { id: transferId } };
  }

  @Post("accounts/adjustments")
  @RequirePermissions("msp.cash.manage")
  async adjustAccount(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: CreateMspAccountAdjustmentDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const accountId = body.accountId.trim();
    const direction = body.direction;
    const amount = this.normalizeMoneyInput(body.amount);
    const entryDate = body.entryDate?.trim() ? this.parseIsoDateOnly(body.entryDate, false) : this.parseIsoDateOnly(undefined, true);
    const note = body.note?.trim() ? body.note.trim() : null;

    await this.assertActiveCashBankAccount(tenantId, accountId);

    const signed = direction === "in" ? amount : amount.mul(-1);
    const id = await this.prisma.$transaction(async (tx) => {
      return await this.insertLedgerEntry(tx, {
        tenantId,
        accountId,
        entryDate,
        source: "adjustment",
        ref: null,
        amountSigned: signed,
        note,
        userId: req.user.id
      });
    });

    await this.prisma.auditLog.create({
      data: { tenantId, actorUserId: req.user.id, action: "msp.account.adjust", entityType: "mspLedgerEntry", entityId: id, metadataJson: { accountId, direction, amount: amount.toString(), entryDate, note } }
    });

    return { data: { id } };
  }

  private async getBankStatementMeta(
    tenantId: string,
    statementId: string
  ): Promise<{ id: string; accountId: string; currencyCode: string; statementFrom: Date; statementTo: Date; status: string }> {
    const row = (
      await this.prisma.$queryRaw<
        Array<{ id: string; accountId: string; currencyCode: string; statementFrom: Date; statementTo: Date; status: string }>
      >`SELECT "id"::text AS "id","accountId"::text AS "accountId","currencyCode","statementFrom","statementTo","status" FROM "MspBankStatement" WHERE "tenantId"=${tenantId} AND "id"=${statementId}::uuid LIMIT 1`
    )[0];
    if (!row) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    return row;
  }

  @Get("bank/statements")
  @RequirePermissions("msp.cash.view")
  async listBankStatements(@Req() req: { tenantId: string }, @Query() query: ListMspBankStatementsQueryDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const accountId = query.accountId.trim();
    const acc = await this.assertActiveCashBankAccount(tenantId, accountId);
    if (acc.type !== "bank") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        statementFrom: Date;
        statementTo: Date;
        openingBalance: Prisma.Decimal;
        closingBalance: Prisma.Decimal;
        status: string;
        lockedAt: Date | null;
        note: string | null;
        createdAt: Date;
      }>
    >(Prisma.sql`
      SELECT
        s."id"::text AS "id",
        s."statementFrom",
        s."statementTo",
        s."openingBalance",
        s."closingBalance",
        s."status",
        s."lockedAt",
        s."note",
        s."createdAt"
      FROM "MspBankStatement" s
      WHERE s."tenantId"=${tenantId} AND s."accountId"=${accountId}::uuid
      ORDER BY s."statementFrom" DESC, s."createdAt" DESC
    `);

    return {
      data: {
        accountId,
        currencyCode: acc.currencyCode,
        items: rows.map((r) => ({
          id: r.id,
          statementFrom: r.statementFrom.toISOString().slice(0, 10),
          statementTo: r.statementTo.toISOString().slice(0, 10),
          openingBalance: r.openingBalance.toString(),
          closingBalance: r.closingBalance.toString(),
          status: r.status,
          lockedAt: r.lockedAt ? r.lockedAt.toISOString() : null,
          note: r.note,
          createdAt: r.createdAt.toISOString()
        }))
      }
    };
  }

  @Post("bank/statements")
  @RequirePermissions("msp.cash.manage")
  async createBankStatement(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: CreateMspBankStatementDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const accountId = body.accountId.trim();
    const acc = await this.assertActiveCashBankAccount(tenantId, accountId);
    if (acc.type !== "bank") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const statementFrom = this.parseIsoDateOnly(body.statementFrom, false);
    const statementTo = this.parseIsoDateOnly(body.statementTo, false);
    if (statementFrom > statementTo) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const openingBalance = body.openingBalance?.trim() ? new Prisma.Decimal(body.openingBalance.trim()) : new Prisma.Decimal(0);
    const closingBalance = body.closingBalance?.trim() ? new Prisma.Decimal(body.closingBalance.trim()) : new Prisma.Decimal(0);
    const note = body.note?.trim() ? body.note.trim() : null;

    const created = (await this.prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "MspBankStatement" ("tenantId","accountId","currencyCode","statementFrom","statementTo","openingBalance","closingBalance","status","lockedAt","lockedByUserId","note","createdAt","createdByUserId")
      VALUES (${tenantId}, ${accountId}::uuid, ${acc.currencyCode}, ${statementFrom}::date, ${statementTo}::date, ${openingBalance}, ${closingBalance}, 'open', NULL, NULL, ${note}, NOW(), ${req.user.id})
      RETURNING "id"::text AS "id"
    `)[0];
    if (!created?.id) throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: req.user.id,
        action: "msp.bank.statement.create",
        entityType: "mspBankStatement",
        entityId: created.id,
        metadataJson: { accountId, currencyCode: acc.currencyCode, statementFrom, statementTo, openingBalance: openingBalance.toString(), closingBalance: closingBalance.toString(), note }
      }
    });

    return { data: { id: created.id } };
  }

  @Post("bank/statements/:id/import-lines")
  @RequirePermissions("msp.cash.manage")
  async importBankStatementLines(
    @Req() req: { tenantId: string; user: { id: string } },
    @Param("id") id: string,
    @Body() body: ImportMspBankStatementLinesDto
  ) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const statement = await this.getBankStatementMeta(tenantId, id);
    if (statement.status !== "open") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.bankStatementLocked" } }, 400);
    const acc = await this.assertActiveCashBankAccount(tenantId, statement.accountId, statement.currencyCode);
    if (acc.type !== "bank") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const replace = body.replace === true;
    const lines = body.lines ?? [];

    const inserted = await this.prisma.$transaction(async (tx) => {
      if (replace) {
        await tx.$queryRaw`DELETE FROM "MspBankStatementMatch" WHERE "tenantId"=${tenantId} AND "statementLineId" IN (SELECT "id" FROM "MspBankStatementLine" WHERE "tenantId"=${tenantId} AND "statementId"=${id}::uuid)`;
        await tx.$queryRaw`DELETE FROM "MspBankStatementLine" WHERE "tenantId"=${tenantId} AND "statementId"=${id}::uuid`;
      }

      let rowIndex = 0;
      let count = 0;
      for (const l of lines) {
        let lineDate: string;
        let amountSigned: Prisma.Decimal;
        let balance: Prisma.Decimal | null;
        try {
          lineDate = this.parseIsoDateOnly(l.lineDate, false);
          amountSigned = new Prisma.Decimal((l.amountSigned ?? "").trim());
          balance = l.balance?.trim() ? new Prisma.Decimal(l.balance.trim()) : null;
        } catch {
          throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
        }
        const description = l.description?.trim() ? l.description.trim() : null;
        const reference = l.reference?.trim() ? l.reference.trim() : null;

        await tx.$queryRaw`
          INSERT INTO "MspBankStatementLine" ("tenantId","statementId","rowIndex","lineDate","description","reference","amountSigned","balance","createdAt")
          VALUES (${tenantId}, ${id}::uuid, ${rowIndex}, ${lineDate}::date, ${description}, ${reference}, ${amountSigned}, ${balance}, NOW())
        `;
        rowIndex += 1;
        count += 1;
      }
      return count;
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: req.user.id,
        action: "msp.bank.statement.import_lines",
        entityType: "mspBankStatement",
        entityId: id,
        metadataJson: { statementId: id, replace, inserted }
      }
    });

    return { data: { inserted } };
  }

  @Get("bank/statements/:id/lines")
  @RequirePermissions("msp.cash.view")
  async listBankStatementLines(@Req() req: { tenantId: string }, @Param("id") id: string, @Query() query: ListMspBankStatementLinesQueryDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const statement = await this.getBankStatementMeta(tenantId, id);
    const acc = await this.assertActiveCashBankAccount(tenantId, statement.accountId, statement.currencyCode);
    if (acc.type !== "bank") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const daysTol = 3;
    const fromTol = new Date(statement.statementFrom);
    fromTol.setDate(fromTol.getDate() - daysTol);
    const toTol = new Date(statement.statementTo);
    toTol.setDate(toTol.getDate() + daysTol);
    const fromTolStr = fromTol.toISOString().slice(0, 10);
    const toTolStr = toTol.toISOString().slice(0, 10);

    const page = query.page ?? 1;
    const pageSize = Math.min(500, query.pageSize ?? 200);
    const matchFilter = query.match ?? "all";
    const offset = (page - 1) * pageSize;

    const whereParts: Prisma.Sql[] = [Prisma.sql`l."tenantId"=${tenantId}`, Prisma.sql`l."statementId"=${id}::uuid`];
    if (matchFilter === "matched") {
      whereParts.push(Prisma.sql`m."ledgerEntryId" IS NOT NULL`);
    } else if (matchFilter === "unmatched") {
      whereParts.push(Prisma.sql`m."ledgerEntryId" IS NULL`);
    }
    const whereSql = Prisma.join(whereParts, " AND ");

    const [lines, totalRow, matches, ledgerRows] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ id: string; rowIndex: number; lineDate: Date; description: string | null; reference: string | null; amountSigned: Prisma.Decimal; balance: Prisma.Decimal | null }>
      >(Prisma.sql`
        SELECT
          l."id"::text AS "id",
          l."rowIndex",
          l."lineDate",
          l."description",
          l."reference",
          l."amountSigned",
          l."balance"
        FROM "MspBankStatementLine" l
        LEFT JOIN "MspBankStatementMatch" m ON m."tenantId"=l."tenantId" AND m."statementLineId"=l."id"
        WHERE ${whereSql}
        ORDER BY l."lineDate" ASC, l."rowIndex" ASC
        LIMIT ${pageSize} OFFSET ${offset}
      `),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "total"
        FROM "MspBankStatementLine" l
        LEFT JOIN "MspBankStatementMatch" m ON m."tenantId"=l."tenantId" AND m."statementLineId"=l."id"
        WHERE ${whereSql}
      `),
      this.prisma.$queryRaw<Array<{ statementLineId: string; ledgerEntryId: string; entryDate: Date; occurredAt: Date; amountSigned: Prisma.Decimal; source: string; ref: string | null; note: string | null }>>(
        Prisma.sql`
          SELECT
            m."statementLineId"::text AS "statementLineId",
            m."ledgerEntryId"::text AS "ledgerEntryId",
            e."entryDate",
            e."occurredAt",
            e."amountSigned",
            e."source",
            e."ref",
            e."note"
          FROM "MspBankStatementMatch" m
          JOIN "MspLedgerEntry" e ON e."tenantId"=m."tenantId" AND e."id"=m."ledgerEntryId"
          WHERE m."tenantId"=${tenantId} AND m."statementLineId" IN (SELECT "id" FROM "MspBankStatementLine" WHERE "tenantId"=${tenantId} AND "statementId"=${id}::uuid)
        `
      ),
      this.prisma.$queryRaw<
        Array<{ ledgerEntryId: string; entryDate: Date; occurredAt: Date; amountSigned: Prisma.Decimal; source: string; ref: string | null; note: string | null }>
      >(Prisma.sql`
        SELECT
          e."id"::text AS "ledgerEntryId",
          e."entryDate",
          e."occurredAt",
          e."amountSigned",
          e."source",
          e."ref",
          e."note"
        FROM "MspLedgerEntry" e
        WHERE e."tenantId"=${tenantId} AND e."accountId"=${statement.accountId}::uuid
          AND e."entryDate" BETWEEN ${fromTolStr}::date AND ${toTolStr}::date
        ORDER BY e."entryDate" ASC, e."occurredAt" ASC
      `)
    ]);

    const matchByLine = new Map<string, typeof matches[number]>();
    for (const m of matches) matchByLine.set(m.statementLineId, m);

    const matchedLedgerIds = new Set<string>(matches.map((m) => m.ledgerEntryId));

    const ledger = ledgerRows.map((l) => ({
      ledgerEntryId: l.ledgerEntryId,
      entryDate: l.entryDate.toISOString().slice(0, 10),
      occurredAt: l.occurredAt.toISOString(),
      amountSigned: l.amountSigned.toString(),
      source: l.source,
      ref: l.ref,
      note: l.note
    }));

    const ledgerForMatching = ledgerRows.filter((l) => !matchedLedgerIds.has(l.ledgerEntryId));

    const items = lines.map((l) => {
      const lineDateStr = l.lineDate.toISOString().slice(0, 10);
      const m = matchByLine.get(l.id) ?? null;
      const suggestions = [];
      for (const le of ledgerForMatching) {
        if (!le.amountSigned.eq(l.amountSigned)) continue;
        const d1 = new Date(le.entryDate.toISOString().slice(0, 10) + "T00:00:00.000Z").getTime();
        const d2 = new Date(lineDateStr + "T00:00:00.000Z").getTime();
        const diffDays = Math.abs(Math.round((d1 - d2) / (24 * 60 * 60 * 1000)));
        if (diffDays > daysTol) continue;
        suggestions.push({
          ledgerEntryId: le.ledgerEntryId,
          entryDate: le.entryDate.toISOString().slice(0, 10),
          occurredAt: le.occurredAt.toISOString(),
          amountSigned: le.amountSigned.toString(),
          source: le.source,
          ref: le.ref,
          note: le.note,
          diffDays
        });
      }
      suggestions.sort((a, b) => a.diffDays - b.diffDays);
      return {
        id: l.id,
        rowIndex: l.rowIndex,
        lineDate: lineDateStr,
        description: l.description,
        reference: l.reference,
        amountSigned: l.amountSigned.toString(),
        balance: l.balance ? l.balance.toString() : null,
        match: m
          ? {
              ledgerEntryId: m.ledgerEntryId,
              entryDate: m.entryDate.toISOString().slice(0, 10),
              occurredAt: m.occurredAt.toISOString(),
              amountSigned: m.amountSigned.toString(),
              source: m.source,
              ref: m.ref,
              note: m.note
            }
          : null,
        suggestions: suggestions.slice(0, 8).map(({ diffDays, ...rest }) => rest)
      };
    });

    return {
      data: {
        statement: {
          id: statement.id,
          accountId: statement.accountId,
          currencyCode: statement.currencyCode,
          statementFrom: statement.statementFrom.toISOString().slice(0, 10),
          statementTo: statement.statementTo.toISOString().slice(0, 10),
          status: statement.status
        },
        page,
        pageSize,
        total: Number(totalRow?.[0]?.total ?? 0),
        items,
        ledger
      }
    };
  }

  @Post("bank/statements/:id/auto-match")
  @RequirePermissions("msp.cash.manage")
  async autoMatchBankStatement(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: AutoMatchMspBankStatementDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const statement = await this.getBankStatementMeta(tenantId, id);
    if (statement.status !== "open") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.bankStatementLocked" } }, 400);
    const acc = await this.assertActiveCashBankAccount(tenantId, statement.accountId, statement.currencyCode);
    if (acc.type !== "bank") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const daysTol = body.daysTolerance ?? 3;
    const fromTol = new Date(statement.statementFrom);
    fromTol.setDate(fromTol.getDate() - daysTol);
    const toTol = new Date(statement.statementTo);
    toTol.setDate(toTol.getDate() + daysTol);
    const fromTolStr = fromTol.toISOString().slice(0, 10);
    const toTolStr = toTol.toISOString().slice(0, 10);

    const stats = await this.prisma.$transaction(async (tx) => {
      const lines = await tx.$queryRaw<
        Array<{ id: string; lineDate: Date; amountSigned: Prisma.Decimal }>
      >(Prisma.sql`
        SELECT l."id"::text AS "id", l."lineDate", l."amountSigned"
        FROM "MspBankStatementLine" l
        LEFT JOIN "MspBankStatementMatch" m ON m."tenantId"=l."tenantId" AND m."statementLineId"=l."id"
        WHERE l."tenantId"=${tenantId} AND l."statementId"=${id}::uuid AND m."ledgerEntryId" IS NULL
        ORDER BY l."lineDate" ASC, l."rowIndex" ASC
      `);

      const matchedLedgerRows = await tx.$queryRaw<Array<{ ledgerEntryId: string }>>(Prisma.sql`
        SELECT "ledgerEntryId"::text AS "ledgerEntryId" FROM "MspBankStatementMatch" WHERE "tenantId"=${tenantId}
      `);
      const matchedLedgerIds = new Set<string>(matchedLedgerRows.map((r) => r.ledgerEntryId));

      const ledger = await tx.$queryRaw<
        Array<{ ledgerEntryId: string; entryDate: Date; occurredAt: Date; amountSigned: Prisma.Decimal }>
      >(Prisma.sql`
        SELECT e."id"::text AS "ledgerEntryId", e."entryDate", e."occurredAt", e."amountSigned"
        FROM "MspLedgerEntry" e
        WHERE e."tenantId"=${tenantId} AND e."accountId"=${statement.accountId}::uuid
          AND e."entryDate" BETWEEN ${fromTolStr}::date AND ${toTolStr}::date
        ORDER BY e."entryDate" ASC, e."occurredAt" ASC
      `);

      const availableLedger = ledger.filter((l) => !matchedLedgerIds.has(l.ledgerEntryId));

      let matched = 0;
      for (const l of lines) {
        const lineDateStr = l.lineDate.toISOString().slice(0, 10);
        const candidates: Array<{ ledgerEntryId: string; diffDays: number }> = [];
        for (const le of availableLedger) {
          if (!le.amountSigned.eq(l.amountSigned)) continue;
          const d1 = new Date(le.entryDate.toISOString().slice(0, 10) + "T00:00:00.000Z").getTime();
          const d2 = new Date(lineDateStr + "T00:00:00.000Z").getTime();
          const diffDays = Math.abs(Math.round((d1 - d2) / (24 * 60 * 60 * 1000)));
          if (diffDays > daysTol) continue;
          candidates.push({ ledgerEntryId: le.ledgerEntryId, diffDays });
        }
        candidates.sort((a, b) => a.diffDays - b.diffDays);
        const best = candidates[0];
        if (!best) continue;

        await tx.$queryRaw`
          INSERT INTO "MspBankStatementMatch" ("tenantId","statementLineId","ledgerEntryId","matchedAt","matchedByUserId")
          VALUES (${tenantId}, ${l.id}::uuid, ${best.ledgerEntryId}::uuid, NOW(), ${req.user.id})
          ON CONFLICT DO NOTHING
        `;
        matchedLedgerIds.add(best.ledgerEntryId);
        matched += 1;
      }
      return { scanned: lines.length, matched };
    });

    await this.prisma.auditLog.create({
      data: { tenantId, actorUserId: req.user.id, action: "msp.bank.statement.auto_match", entityType: "mspBankStatement", entityId: id, metadataJson: { daysTolerance: daysTol, scanned: stats.scanned, matched: stats.matched } }
    });

    return { data: { ...stats, daysTolerance: daysTol } };
  }

  @Patch("bank/statement-lines/:id/match")
  @RequirePermissions("msp.cash.manage")
  async matchBankStatementLine(
    @Req() req: { tenantId: string; user: { id: string } },
    @Param("id") lineId: string,
    @Body() body: MatchMspBankStatementLineDto
  ) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const line = (
      await this.prisma.$queryRaw<Array<{ statementId: string; lineDate: Date }>>`
        SELECT "statementId"::text AS "statementId","lineDate" FROM "MspBankStatementLine"
        WHERE "tenantId"=${tenantId} AND "id"=${lineId}::uuid
        LIMIT 1
      `
    )[0];
    if (!line) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    const statement = await this.getBankStatementMeta(tenantId, line.statementId);
    if (statement.status !== "open") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.bankStatementLocked" } }, 400);

    const ledgerEntryId = body.ledgerEntryId?.trim() ? body.ledgerEntryId.trim() : null;
    if (!ledgerEntryId) {
      await this.prisma.$queryRaw`DELETE FROM "MspBankStatementMatch" WHERE "tenantId"=${tenantId} AND "statementLineId"=${lineId}::uuid`;
      return { data: { success: true } };
    }

    const e = (
      await this.prisma.$queryRaw<
        Array<{ ledgerEntryId: string; accountId: string }>
      >`SELECT "id"::text AS "ledgerEntryId","accountId"::text AS "accountId" FROM "MspLedgerEntry" WHERE "tenantId"=${tenantId} AND "id"=${ledgerEntryId}::uuid LIMIT 1`
    )[0];
    if (!e) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (e.accountId !== statement.accountId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const current = (
      await this.prisma.$queryRaw<Array<{ ledgerEntryId: string }>>`
        SELECT "ledgerEntryId"::text AS "ledgerEntryId"
        FROM "MspBankStatementMatch"
        WHERE "tenantId"=${tenantId} AND "statementLineId"=${lineId}::uuid
        LIMIT 1
      `
    )[0];
    if (current?.ledgerEntryId && current.ledgerEntryId === ledgerEntryId) {
      return { data: { success: true } };
    }

    const existing = (await this.prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COUNT(*)::bigint AS "total"
      FROM "MspBankStatementMatch"
      WHERE "tenantId"=${tenantId} AND "ledgerEntryId"=${ledgerEntryId}::uuid
        AND "statementLineId" <> ${lineId}::uuid
    `)[0];
    if (Number(existing?.total ?? 0) > 0) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.bankLedgerAlreadyMatched" } }, 400);

    await this.prisma.$queryRaw`
      INSERT INTO "MspBankStatementMatch" ("tenantId","statementLineId","ledgerEntryId","matchedAt","matchedByUserId")
      VALUES (${tenantId}, ${lineId}::uuid, ${ledgerEntryId}::uuid, NOW(), ${req.user.id})
      ON CONFLICT ("tenantId","statementLineId") DO UPDATE SET "ledgerEntryId"=EXCLUDED."ledgerEntryId","matchedAt"=NOW(),"matchedByUserId"=${req.user.id}
    `;

    return { data: { success: true } };
  }

  @Post("bank/statements/:id/lock")
  @RequirePermissions("msp.cash.manage")
  async lockBankStatement(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: LockMspBankStatementDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const statement = await this.getBankStatementMeta(tenantId, id);
    const lock = body.lock !== false;
    if (lock) {
      await this.prisma.$queryRaw`
        UPDATE "MspBankStatement" SET "status"='locked',"lockedAt"=NOW(),"lockedByUserId"=${req.user.id}
        WHERE "tenantId"=${tenantId} AND "id"=${id}::uuid
      `;
    } else {
      await this.prisma.$queryRaw`
        UPDATE "MspBankStatement" SET "status"='open',"lockedAt"=NULL,"lockedByUserId"=NULL
        WHERE "tenantId"=${tenantId} AND "id"=${id}::uuid
      `;
    }

    await this.prisma.auditLog.create({
      data: { tenantId, actorUserId: req.user.id, action: lock ? "msp.bank.statement.lock" : "msp.bank.statement.unlock", entityType: "mspBankStatement", entityId: id, metadataJson: { lock } }
    });

    return { data: { success: true } };
  }

  @Post("bank/statement-lines/:id/adjustment")
  @RequirePermissions("msp.cash.manage")
  async createBankStatementAdjustment(
    @Req() req: { tenantId: string; user: { id: string } },
    @Param("id") lineId: string,
    @Body() body: CreateMspBankStatementAdjustmentDto
  ) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const line = (
      await this.prisma.$queryRaw<Array<{ statementId: string; lineDate: Date; amountSigned: Prisma.Decimal }>>`
        SELECT "statementId"::text AS "statementId","lineDate","amountSigned"
        FROM "MspBankStatementLine"
        WHERE "tenantId"=${tenantId} AND "id"=${lineId}::uuid
        LIMIT 1
      `
    )[0];
    if (!line) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    const statement = await this.getBankStatementMeta(tenantId, line.statementId);
    if (statement.status !== "open") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.bankStatementLocked" } }, 400);
    const acc = await this.assertActiveCashBankAccount(tenantId, statement.accountId, statement.currencyCode);
    if (acc.type !== "bank") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const amountSigned = new Prisma.Decimal(body.amountSigned.trim());
    const entryDate = body.entryDate?.trim() ? this.parseIsoDateOnly(body.entryDate, false) : line.lineDate.toISOString().slice(0, 10);
    const note = body.note?.trim() ? body.note.trim() : "Bank adjustment";

    const ledgerEntryId = await this.prisma.$transaction(async (tx) => {
      const created = await this.insertLedgerEntry(tx, { tenantId, accountId: statement.accountId, entryDate, source: "bank_adjustment", ref: lineId, amountSigned, note, userId: req.user.id });
      await tx.$queryRaw`
        INSERT INTO "MspBankStatementMatch" ("tenantId","statementLineId","ledgerEntryId","matchedAt","matchedByUserId")
        VALUES (${tenantId}, ${lineId}::uuid, ${created}::uuid, NOW(), ${req.user.id})
        ON CONFLICT ("tenantId","statementLineId") DO UPDATE SET "ledgerEntryId"=EXCLUDED."ledgerEntryId","matchedAt"=NOW(),"matchedByUserId"=${req.user.id}
      `;
      return created;
    });

    await this.prisma.auditLog.create({
      data: { tenantId, actorUserId: req.user.id, action: "msp.bank.statement.adjustment", entityType: "mspBankStatementLine", entityId: lineId, metadataJson: { ledgerEntryId, entryDate, amountSigned: amountSigned.toString(), note } }
    });

    return { data: { ledgerEntryId } };
  }

  @Get("cash/sessions")
  @RequirePermissions("msp.cash.view")
  async listCashSessions(@Req() req: { tenantId: string }, @Query() query: ListMspCashSessionsQueryDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const status = query.status ?? "all";
    const accountId = query.accountId?.trim() ? query.accountId.trim() : null;
    const from = this.parseIsoDateOnlyOrNull(query.from);
    const to = this.parseIsoDateOnlyOrNull(query.to);

    const whereParts: Prisma.Sql[] = [Prisma.sql`s."tenantId"=${tenantId}`];
    if (status !== "all") whereParts.push(Prisma.sql`s."status"=${status}`);
    if (accountId) whereParts.push(Prisma.sql`s."accountId"=${accountId}::uuid`);
    if (from && to) whereParts.push(Prisma.sql`s."openedAt"::date BETWEEN ${from}::date AND ${to}::date`);
    else if (from) whereParts.push(Prisma.sql`s."openedAt"::date >= ${from}::date`);
    else if (to) whereParts.push(Prisma.sql`s."openedAt"::date <= ${to}::date`);

    const whereSql = Prisma.join(whereParts, " AND ");
    const offset = (page - 1) * pageSize;

    const [rows, countRow] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          id: string;
          accountId: string;
          accountName: string;
          currencyCode: string;
          status: string;
          openedAt: Date;
          closedAt: Date | null;
          openedBookBalance: Prisma.Decimal;
          closedBookBalance: Prisma.Decimal | null;
          countedAmount: Prisma.Decimal | null;
          variance: Prisma.Decimal | null;
          denominationsJson: unknown | null;
          note: string | null;
          createdByUserId: string | null;
          closedByUserId: string | null;
        }>
      >(Prisma.sql`
        SELECT
          s."id"::text AS "id",
          s."accountId"::text AS "accountId",
          a."name" AS "accountName",
          s."currencyCode" AS "currencyCode",
          s."status" AS "status",
          s."openedAt" AS "openedAt",
          s."closedAt" AS "closedAt",
          s."openedBookBalance" AS "openedBookBalance",
          s."closedBookBalance" AS "closedBookBalance",
          s."countedAmount" AS "countedAmount",
          s."variance" AS "variance",
          s."denominationsJson" AS "denominationsJson",
          s."note" AS "note",
          s."createdByUserId" AS "createdByUserId",
          s."closedByUserId" AS "closedByUserId"
        FROM "MspCashSession" s
        JOIN "MspAccount" a ON a."tenantId"=s."tenantId" AND a."id"=s."accountId"
        WHERE ${whereSql}
        ORDER BY s."openedAt" DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "total" FROM "MspCashSession" s WHERE ${whereSql}
      `)
    ]);

    return {
      data: {
        page,
        pageSize,
        total: Number(countRow?.[0]?.total ?? 0),
        items: rows.map((r) => ({
          id: r.id,
          accountId: r.accountId,
          accountName: r.accountName,
          currencyCode: r.currencyCode,
          status: r.status,
          openedAt: r.openedAt.toISOString(),
          closedAt: r.closedAt ? r.closedAt.toISOString() : null,
          openedBookBalance: r.openedBookBalance.toString(),
          closedBookBalance: r.closedBookBalance ? r.closedBookBalance.toString() : null,
          countedAmount: r.countedAmount ? r.countedAmount.toString() : null,
          variance: r.variance ? r.variance.toString() : null,
          denominations: (Array.isArray(r.denominationsJson) ? r.denominationsJson : []) as unknown[],
          note: r.note,
          createdByUserId: r.createdByUserId,
          closedByUserId: r.closedByUserId
        }))
      }
    };
  }

  @Post("cash/sessions/open")
  @RequirePermissions("msp.cash.manage")
  async openCashSession(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: OpenMspCashSessionDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const accountId = body.accountId.trim();
    const note = body.note?.trim() ? body.note.trim() : null;
    const acc = await this.assertActiveCashBankAccount(tenantId, accountId);
    if (acc.type !== "cash") {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const openedAt = body.openedAt?.trim() ? new Date(body.openedAt.trim()) : new Date();
    if (!Number.isFinite(openedAt.getTime())) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const id = await this.prisma.$transaction(async (tx) => {
      const existing = (await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"::text AS "id"
        FROM "MspCashSession"
        WHERE "tenantId"=${tenantId} AND "accountId"=${accountId}::uuid AND "status"='open'
        LIMIT 1
      `)[0];
      if (existing?.id) {
        throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.cashSessionAlreadyOpen" } }, 400);
      }

      const openedBookBalance = await this.getAccountBalance(tx, tenantId, accountId);
      const created = (await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "MspCashSession" ("tenantId","accountId","currencyCode","status","openedAt","openedBookBalance","note","createdAt","createdByUserId")
        VALUES (${tenantId}, ${accountId}::uuid, ${acc.currencyCode}, 'open', ${openedAt}, ${openedBookBalance}, ${note}, NOW(), ${req.user.id})
        RETURNING "id"::text AS "id"
      `)[0];
      if (!created?.id) throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);
      return created.id;
    });

    await this.prisma.auditLog.create({
      data: { tenantId, actorUserId: req.user.id, action: "msp.cash.session.open", entityType: "mspCashSession", entityId: id, metadataJson: { accountId, openedAt: openedAt.toISOString(), note } }
    });

    return { data: { id } };
  }

  @Post("cash/sessions/:id/close")
  @RequirePermissions("msp.cash.manage")
  async closeCashSession(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: CloseMspCashSessionDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const closedAt = body.closedAt?.trim() ? new Date(body.closedAt.trim()) : new Date();
    if (!Number.isFinite(closedAt.getTime())) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }
    const entryDate = closedAt.toISOString().slice(0, 10);
    const note = body.note?.trim() ? body.note.trim() : null;

    const denominations = (body.denominations ?? []).map((d) => ({ value: (d.value ?? "").trim(), qty: d.qty }));
    let countedAmount = new Prisma.Decimal(0);
    const normalizedDenoms: Array<{ value: string; qty: number; amount: string }> = [];
    for (const d of denominations) {
      if (!d.value) continue;
      const denomValue = this.normalizeMoneyInput(d.value);
      const qty = Number.isFinite(d.qty) ? Math.trunc(d.qty) : 0;
      if (qty < 0) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      if (qty === 0) continue;
      const amount = denomValue.mul(qty);
      countedAmount = countedAmount.add(amount);
      normalizedDenoms.push({ value: denomValue.toString(), qty, amount: amount.toString() });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const session = (await tx.$queryRaw<Array<{ accountId: string; currencyCode: string; status: string }>>`
        SELECT "accountId"::text AS "accountId","currencyCode","status"
        FROM "MspCashSession"
        WHERE "tenantId"=${tenantId} AND "id"=${id}::uuid
        LIMIT 1
      `)[0];
      if (!session) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
      if (session.status !== "open") {
        throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.cashSessionNotOpen" } }, 400);
      }

      const acc = await this.assertActiveCashBankAccount(tenantId, session.accountId);
      if (acc.type !== "cash") {
        throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      }

      const closedBookBalance = await this.getAccountBalance(tx, tenantId, session.accountId);
      const variance = countedAmount.sub(closedBookBalance);
      const denomsJson = JSON.stringify(normalizedDenoms);

      await tx.$queryRaw`
        UPDATE "MspCashSession"
        SET
          "status"='closed',
          "closedAt"=${closedAt},
          "closedBookBalance"=${closedBookBalance},
          "countedAmount"=${countedAmount},
          "variance"=${variance},
          "denominationsJson"=${denomsJson}::jsonb,
          "note"=${note},
          "closedByUserId"=${req.user.id}
        WHERE "tenantId"=${tenantId} AND "id"=${id}::uuid
      `;

      if (!variance.eq(0)) {
        await this.insertLedgerEntry(tx, { tenantId, accountId: session.accountId, entryDate, source: "cash_count", ref: id, amountSigned: variance, note, userId: req.user.id });
        const overShortAccountId = await this.getOrCreateSystemAccount(tx, { tenantId, systemCode: "cash_over_short", currencyCode: session.currencyCode, name: "Cash over/short", userId: req.user.id });
        await this.insertLedgerEntry(tx, { tenantId, accountId: overShortAccountId, entryDate, source: "cash_count", ref: id, amountSigned: variance, note, userId: req.user.id });
      }

      return { accountId: session.accountId, currencyCode: session.currencyCode, closedBookBalance, variance };
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: req.user.id,
        action: "msp.cash.session.close",
        entityType: "mspCashSession",
        entityId: id,
        metadataJson: { closedAt: closedAt.toISOString(), entryDate, countedAmount: countedAmount.toString(), accountId: result.accountId, currencyCode: result.currencyCode, variance: result.variance.toString(), note }
      }
    });

    return {
      data: {
        id,
        closedAt: closedAt.toISOString(),
        entryDate,
        countedAmount: countedAmount.toString(),
        variance: result.variance.toString()
      }
    };
  }

  @Get("rates")
  @RequirePermissions("msp.settings.view")
  async listRates(@Req() req: { tenantId: string }, @Query() query: GetMspRatesQueryDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const effectiveDate = this.parseIsoDateOnly(query.date, true);
    const baseCode = query.baseCode?.trim() ? query.baseCode.trim().toUpperCase() : null;

    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; baseCode: string; quoteCode: string; effectiveDate: Date; buyRate: Prisma.Decimal; sellRate: Prisma.Decimal; updatedAt: Date; updatedByUserId: string | null }>
    >(
      baseCode
        ? Prisma.sql`SELECT "id","baseCode","quoteCode","effectiveDate","buyRate","sellRate","updatedAt","updatedByUserId" FROM "MspExchangeRate" WHERE "tenantId"=${tenantId} AND "effectiveDate"=${effectiveDate}::date AND "baseCode"=${baseCode} ORDER BY "quoteCode" ASC`
        : Prisma.sql`SELECT "id","baseCode","quoteCode","effectiveDate","buyRate","sellRate","updatedAt","updatedByUserId" FROM "MspExchangeRate" WHERE "tenantId"=${tenantId} AND "effectiveDate"=${effectiveDate}::date ORDER BY "baseCode" ASC, "quoteCode" ASC`
    );

    return {
      data: {
        effectiveDate,
        items: rows.map((r) => ({
          id: r.id,
          baseCode: r.baseCode,
          quoteCode: r.quoteCode,
          buyRate: r.buyRate.toString(),
          sellRate: r.sellRate.toString(),
          updatedAt: r.updatedAt.toISOString(),
          updatedByUserId: r.updatedByUserId
        }))
      }
    };
  }

  @Put("rates")
  @RequirePermissions("msp.settings.manage")
  async upsertRate(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: UpsertMspRateDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const baseCode = body.baseCode.trim().toUpperCase();
    const quoteCode = body.quoteCode.trim().toUpperCase();
    const effectiveDate = this.parseIsoDateOnly(body.effectiveDate, false);
    const buyRate = new Prisma.Decimal(body.buyRate);
    const sellRate = new Prisma.Decimal(body.sellRate);
    if (buyRate.lte(0) || sellRate.lte(0)) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }
    if (baseCode === quoteCode) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    await this.prisma.$executeRaw`
      INSERT INTO "MspExchangeRate" ("tenantId","baseCode","quoteCode","effectiveDate","buyRate","sellRate","updatedAt","updatedByUserId")
      VALUES (${tenantId}, ${baseCode}, ${quoteCode}, ${effectiveDate}::date, ${buyRate}, ${sellRate}, NOW(), ${req.user.id})
      ON CONFLICT ("tenantId","baseCode","quoteCode","effectiveDate")
      DO UPDATE SET "buyRate"=EXCLUDED."buyRate", "sellRate"=EXCLUDED."sellRate", "updatedAt"=NOW(), "updatedByUserId"=${req.user.id}
    `;

    return { data: { success: true } };
  }

  @Put("rates/bulk")
  @RequirePermissions("msp.settings.manage")
  async bulkUpsertRates(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: BulkUpsertMspRatesDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const baseCode = body.baseCode.trim().toUpperCase();
    const effectiveDate = this.parseIsoDateOnly(body.effectiveDate, false);

    const items = (body.items ?? [])
      .map((i) => ({
        quoteCode: i.quoteCode.trim().toUpperCase(),
        buyRate: new Prisma.Decimal(i.buyRate),
        sellRate: new Prisma.Decimal(i.sellRate)
      }))
      .filter((i) => i.quoteCode && i.quoteCode !== baseCode);

    for (const it of items) {
      if (it.buyRate.lte(0) || it.sellRate.lte(0)) {
        throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const it of items) {
        await tx.$executeRaw`
          INSERT INTO "MspExchangeRate" ("tenantId","baseCode","quoteCode","effectiveDate","buyRate","sellRate","updatedAt","updatedByUserId")
          VALUES (${tenantId}, ${baseCode}, ${it.quoteCode}, ${effectiveDate}::date, ${it.buyRate}, ${it.sellRate}, NOW(), ${req.user.id})
          ON CONFLICT ("tenantId","baseCode","quoteCode","effectiveDate")
          DO UPDATE SET "buyRate"=EXCLUDED."buyRate", "sellRate"=EXCLUDED."sellRate", "updatedAt"=NOW(), "updatedByUserId"=${req.user.id}
        `;
      }
    });

    return { data: { success: true } };
  }

  @Get("exchange/tickets")
  @RequirePermissions("msp.exchange.view")
  async listExchangeTickets(@Req() req: { tenantId: string }, @Query() query: ListMspExchangeTicketsQueryDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const q = query.q?.trim() ? query.q.trim().toLowerCase() : null;
    const type = query.type?.trim() ? query.type.trim() : null;

    const from = query.from?.trim() ? this.parseIsoDateOnly(query.from, false) : null;
    const to = query.to?.trim() ? this.parseIsoDateOnly(query.to, false) : null;

    const whereParts: Prisma.Sql[] = [Prisma.sql`"tenantId"=${tenantId}`];
    if (type) whereParts.push(Prisma.sql`"type"=${type}`);
    if (from && to) whereParts.push(Prisma.sql`"effectiveDate" BETWEEN ${from}::date AND ${to}::date`);
    else if (from) whereParts.push(Prisma.sql`"effectiveDate" >= ${from}::date`);
    else if (to) whereParts.push(Prisma.sql`"effectiveDate" <= ${to}::date`);
    if (q) {
      whereParts.push(
        Prisma.sql`(LOWER(COALESCE("customerName",'')) LIKE ${"%" + q + "%"} OR LOWER(COALESCE("customerPhone",'')) LIKE ${"%" + q + "%"} OR CAST("ticketNumber" AS TEXT) LIKE ${"%" + q + "%"})`
      );
    }

    const whereSql = Prisma.join(whereParts, " AND ");
    const offset = (page - 1) * pageSize;

    const [rows, countRow] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          id: string;
          ticketNumber: number;
          type: string;
          baseCode: string;
          quoteCode: string;
          effectiveDate: Date;
          quoteAmount: Prisma.Decimal;
          rate: Prisma.Decimal;
          baseAmount: Prisma.Decimal;
          feeBase: Prisma.Decimal;
          customerId: string | null;
          customerName: string | null;
          customerPhone: string | null;
          createdAt: Date;
        }>
      >(Prisma.sql`
        SELECT "id","ticketNumber","type","baseCode","quoteCode","effectiveDate","quoteAmount","rate","baseAmount","feeBase","customerId"::text AS "customerId","customerName","customerPhone","createdAt"
        FROM "MspExchangeTicket"
        WHERE ${whereSql}
        ORDER BY "ticketNumber" DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "total" FROM "MspExchangeTicket" WHERE ${whereSql}
      `)
    ]);

    const total = Number(countRow?.[0]?.total ?? 0);

    return {
      data: {
        page,
        pageSize,
        total,
        items: rows.map((r) => ({
          id: r.id,
          ticketNumber: r.ticketNumber,
          type: r.type,
          baseCode: r.baseCode,
          quoteCode: r.quoteCode,
          effectiveDate: r.effectiveDate.toISOString().slice(0, 10),
          quoteAmount: r.quoteAmount.toString(),
          rate: r.rate.toString(),
          baseAmount: r.baseAmount.toString(),
          feeBase: r.feeBase.toString(),
          customerId: r.customerId,
          customerName: r.customerName,
          customerPhone: r.customerPhone,
          createdAt: r.createdAt.toISOString()
        }))
      }
    };
  }

  @Get("exchange/tickets/:id")
  @RequirePermissions("msp.exchange.view")
  async getExchangeTicket(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        ticketNumber: number;
        type: string;
        baseCode: string;
        quoteCode: string;
        effectiveDate: Date;
        quoteAmount: Prisma.Decimal;
        rate: Prisma.Decimal;
        baseAmount: Prisma.Decimal;
        feeBase: Prisma.Decimal;
        customerId: string | null;
        customerName: string | null;
        customerPhone: string | null;
        note: string | null;
        baseAccountId: string | null;
        quoteAccountId: string | null;
        createdAt: Date;
        createdByUserId: string | null;
      }>
    >(
      Prisma.sql`
        SELECT
          t."id",t."ticketNumber",t."type",t."baseCode",t."quoteCode",t."effectiveDate",t."quoteAmount",t."rate",t."baseAmount",t."feeBase",
          t."customerId"::text AS "customerId",
          t."customerName",t."customerPhone",t."note",
          t."baseAccountId"::text AS "baseAccountId",
          t."quoteAccountId"::text AS "quoteAccountId",
          t."createdAt",t."createdByUserId"
        FROM "MspExchangeTicket" t
        WHERE t."tenantId"=${tenantId} AND t."id"=${id}
        LIMIT 1
      `
    );
    const r = rows[0];
    if (!r) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    return {
      data: {
        id: r.id,
        ticketNumber: r.ticketNumber,
        type: r.type,
        baseCode: r.baseCode,
        quoteCode: r.quoteCode,
        effectiveDate: r.effectiveDate.toISOString().slice(0, 10),
        quoteAmount: r.quoteAmount.toString(),
        rate: r.rate.toString(),
        baseAmount: r.baseAmount.toString(),
        feeBase: r.feeBase.toString(),
        customerId: r.customerId,
        customerName: r.customerName,
        customerPhone: r.customerPhone,
        note: r.note,
        baseAccountId: r.baseAccountId,
        quoteAccountId: r.quoteAccountId,
        createdAt: r.createdAt.toISOString(),
        createdByUserId: r.createdByUserId
      }
    };
  }

  @Post("exchange/tickets")
  @RequirePermissions("msp.exchange.manage")
  async createExchangeTicket(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: CreateMspExchangeTicketDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const baseCode = body.baseCode.trim().toUpperCase();
    const quoteCode = body.quoteCode.trim().toUpperCase();
    const customerId = body.customerId?.trim() ? body.customerId.trim() : null;
    const type = body.type;
    const effectiveDate = this.parseIsoDateOnly(body.effectiveDate, false);
    const baseAccountId = body.baseAccountId.trim();
    const quoteAccountId = body.quoteAccountId.trim();

    if (!baseCode || !quoteCode || baseCode === quoteCode) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }
    if (!baseAccountId || !quoteAccountId) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const quoteAmount = this.normalizeMoneyInput(body.quoteAmount);
    const rate = this.normalizeMoneyInput(body.rate);
    const feeBase = body.feeBase !== undefined ? this.normalizeMoneyInput(body.feeBase, true) : new Prisma.Decimal(0);

    const baseAmount = quoteAmount.mul(rate);
    const totalBase = baseAmount.add(feeBase);

    const customerName = body.customerName?.trim() ? body.customerName.trim() : null;
    const customerPhone = body.customerPhone?.trim() ? body.customerPhone.trim() : null;
    const note = body.note?.trim() ? body.note.trim() : null;

    const compliance = await this.getCompliancePolicyFromDb(this.prisma.$queryRaw, tenantId);
    const kycThreshold = this.parseDecimalFromPolicy(compliance.kyc.requiredAboveByCurrency, baseCode, new Prisma.Decimal("999999999999"));
    const kycAboveThreshold = totalBase.gte(kycThreshold);

    const id = await this.prisma.$transaction(async (tx) => {
      await this.assertActiveCurrency(tenantId, baseCode);
      await this.assertActiveCurrency(tenantId, quoteCode);
      await this.assertActiveAccount(tenantId, baseAccountId, baseCode);
      await this.assertActiveAccount(tenantId, quoteAccountId, quoteCode);
      if (compliance.kyc.enforceMode === "above_threshold" && kycAboveThreshold && compliance.kyc.requireCustomerAboveThreshold && !customerId) {
        throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.kycCustomerRequired" } }, 400);
      }
      if (customerId) {
        const row = (
          await tx.$queryRaw<Array<{ id: string; kycStatus: string }>>(Prisma.sql`
            SELECT "id"::text AS "id","kycStatus" FROM "MspCustomer"
            WHERE "tenantId"=${tenantId} AND "id"=${customerId}::uuid
            LIMIT 1
          `)
        )[0];
        if (!row?.id) {
          throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
        }
        const requireVerifiedKyc = compliance.kyc.enforceMode === "always" ? true : kycAboveThreshold;
        if (requireVerifiedKyc && (row.kycStatus ?? "none") !== "verified") {
          throw new HttpException({ error: { code: "KYC_REQUIRED", message_key: "errors.kycRequired" } }, 403);
        }
      }

      const seqRow = (await tx.$queryRaw<Array<{ ticketNumber: number }>>`
        UPDATE "MspSettings"
        SET "nextExchangeTicketNumber"="nextExchangeTicketNumber"+1, "updatedAt"=NOW()
        WHERE "tenantId"=${tenantId}
        RETURNING ("nextExchangeTicketNumber" - 1) AS "ticketNumber"
      `)[0];
      const ticketNumber = seqRow?.ticketNumber ?? 1;

      const created = (await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "MspExchangeTicket" ("tenantId","ticketNumber","type","baseCode","quoteCode","effectiveDate","quoteAmount","rate","baseAmount","feeBase","customerId","customerName","customerPhone","note","baseAccountId","quoteAccountId","createdAt","createdByUserId")
        VALUES (${tenantId}, ${ticketNumber}, ${type}, ${baseCode}, ${quoteCode}, ${effectiveDate}::date, ${quoteAmount}, ${rate}, ${baseAmount}, ${feeBase}, ${customerId}::uuid, ${customerName}, ${customerPhone}, ${note}, ${baseAccountId}::uuid, ${quoteAccountId}::uuid, NOW(), ${req.user.id})
        RETURNING "id"
      `)[0];
      if (!created?.id) {
        throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);
      }

      if (type === "buy") {
        await this.assertSufficientBalance(tx, tenantId, baseAccountId, totalBase);
        await this.insertLedgerEntry(tx, {
          tenantId,
          accountId: quoteAccountId,
          entryDate: effectiveDate,
          source: "exchange_ticket",
          ref: created.id,
          amountSigned: quoteAmount,
          note,
          userId: req.user.id
        });
        await this.insertLedgerEntry(tx, {
          tenantId,
          accountId: baseAccountId,
          entryDate: effectiveDate,
          source: "exchange_ticket",
          ref: created.id,
          amountSigned: totalBase.mul(-1),
          note,
          userId: req.user.id
        });
      } else {
        await this.assertSufficientBalance(tx, tenantId, quoteAccountId, quoteAmount);
        await this.insertLedgerEntry(tx, {
          tenantId,
          accountId: baseAccountId,
          entryDate: effectiveDate,
          source: "exchange_ticket",
          ref: created.id,
          amountSigned: totalBase,
          note,
          userId: req.user.id
        });
        await this.insertLedgerEntry(tx, {
          tenantId,
          accountId: quoteAccountId,
          entryDate: effectiveDate,
          source: "exchange_ticket",
          ref: created.id,
          amountSigned: quoteAmount.mul(-1),
          note,
          userId: req.user.id
        });
      }

      await this.applyFxWacFromExchangeTicket(tx, { tenantId, ticketId: created.id, type, baseCode, quoteCode, quoteAmount, baseAmount, feeBase });
      if (customerId) {
        await this.evaluateAmlForCustomerTxn(tx, {
          tenantId,
          sourceType: "exchange_ticket",
          sourceId: created.id,
          txnDate: effectiveDate,
          customerId,
          currencyCode: baseCode,
          amount: totalBase
        });
      }
      return created.id;
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: req.user.id,
        action: "msp.exchange.ticket.create",
        entityType: "mspExchangeTicket",
        entityId: id,
        metadataJson: {
          type,
          baseCode,
          quoteCode,
          effectiveDate,
          quoteAmount: quoteAmount.toString(),
          rate: rate.toString(),
          baseAmount: baseAmount.toString(),
          feeBase: feeBase.toString(),
          totalBase: totalBase.toString(),
          baseAccountId,
          quoteAccountId,
          customerId,
          customerName,
          customerPhone,
          note
        }
      }
    });

    return { data: { id } };
  }

  @Get("customers")
  @RequirePermissions("msp.customers.view")
  async listCustomers(@Req() req: { tenantId: string }, @Query() query: ListMspCustomersQueryDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const q = query.q?.trim() ? query.q.trim().toLowerCase() : null;
    const status = query.status ?? "all";

    const whereParts: Prisma.Sql[] = [Prisma.sql`"tenantId"=${tenantId}`];
    if (status === "active") whereParts.push(Prisma.sql`"isActive"=TRUE`);
    if (status === "inactive") whereParts.push(Prisma.sql`"isActive"=FALSE`);
    if (q) {
      whereParts.push(Prisma.sql`(LOWER("name") LIKE ${"%" + q + "%"} OR LOWER(COALESCE("phone",'')) LIKE ${"%" + q + "%"})`);
    }

    const whereSql = Prisma.join(whereParts, " AND ");
    const offset = (page - 1) * pageSize;

    const [rows, countRow] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ id: string; name: string; phone: string | null; isActive: boolean; note: string | null; kycStatus: string; kycVerifiedAt: Date | null; createdAt: Date; updatedAt: Date }>
      >(Prisma.sql`
        SELECT "id","name","phone","isActive","note","kycStatus","kycVerifiedAt","createdAt","updatedAt"
        FROM "MspCustomer"
        WHERE ${whereSql}
        ORDER BY "name" ASC
        LIMIT ${pageSize} OFFSET ${offset}
      `),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "total" FROM "MspCustomer" WHERE ${whereSql}
      `)
    ]);

    return {
      data: {
        page,
        pageSize,
        total: Number(countRow?.[0]?.total ?? 0),
        items: rows.map((r) => ({
          id: r.id,
          name: r.name,
          phone: r.phone,
          isActive: r.isActive,
          note: r.note,
          kycStatus: r.kycStatus,
          kycVerifiedAt: r.kycVerifiedAt ? r.kycVerifiedAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString()
        }))
      }
    };
  }

  @Post("customers")
  @RequirePermissions("msp.customers.manage")
  async createCustomer(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: CreateMspCustomerDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const name = body.name.trim();
    if (!name) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    const phone = body.phone?.trim() ? body.phone.trim() : null;
    const isActive = typeof body.isActive === "boolean" ? body.isActive : true;
    const note = body.note?.trim() ? body.note.trim() : null;

    const created = (await this.prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "MspCustomer" ("tenantId","name","phone","isActive","note","createdAt","updatedAt","createdByUserId","updatedByUserId")
      VALUES (${tenantId}, ${name}, ${phone}, ${isActive}, ${note}, NOW(), NOW(), ${req.user.id}, ${req.user.id})
      RETURNING "id"
    `)[0];
    if (!created?.id) throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);
    return { data: { id: created.id } };
  }

  @Patch("customers/:id")
  @RequirePermissions("msp.customers.manage")
  async updateCustomer(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: UpdateMspCustomerDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const existing = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "MspCustomer" WHERE "tenantId"=${tenantId} AND "id"=${id} LIMIT 1
    `;
    if (existing.length === 0) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const updates: Prisma.Sql[] = [];
    if (body.name !== undefined) updates.push(Prisma.sql`"name"=${body.name.trim()}`);
    if (body.phone !== undefined) updates.push(Prisma.sql`"phone"=${body.phone?.trim() ? body.phone.trim() : null}`);
    if (body.isActive !== undefined) updates.push(Prisma.sql`"isActive"=${body.isActive}`);
    if (body.note !== undefined) updates.push(Prisma.sql`"note"=${body.note?.trim() ? body.note.trim() : null}`);
    updates.push(Prisma.sql`"updatedAt"=NOW()`);
    updates.push(Prisma.sql`"updatedByUserId"=${req.user.id}`);

    await this.prisma.$executeRaw`
      UPDATE "MspCustomer" SET ${Prisma.join(updates, ", ")}
      WHERE "tenantId"=${tenantId} AND "id"=${id}
    `;
    return { data: { success: true } };
  }

  @Get("customers/:id/kyc")
  @RequirePermissions("msp.customers.view")
  async getCustomerKyc(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const row = (
      await this.prisma.$queryRaw<
        Array<{ id: string; kycStatus: string; kycJson: unknown | null; kycUpdatedAt: Date | null; kycVerifiedAt: Date | null; kycVerifiedByUserId: string | null }>
      >`SELECT "id","kycStatus","kycJson","kycUpdatedAt","kycVerifiedAt","kycVerifiedByUserId" FROM "MspCustomer" WHERE "tenantId"=${tenantId} AND "id"=${id}::uuid LIMIT 1`
    )[0];
    if (!row) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    return {
      data: {
        status: row.kycStatus,
        profile: row.kycJson && typeof row.kycJson === "object" ? row.kycJson : {},
        updatedAt: row.kycUpdatedAt ? row.kycUpdatedAt.toISOString() : null,
        verifiedAt: row.kycVerifiedAt ? row.kycVerifiedAt.toISOString() : null,
        verifiedByUserId: row.kycVerifiedByUserId
      }
    };
  }

  @Patch("customers/:id/kyc")
  @RequirePermissions("msp.customers.manage")
  async updateCustomerKyc(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: UpdateMspCustomerKycDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    await this.getCustomer(tenantId, id);

    const trimmed = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);
    const profile: Record<string, unknown> = {};
    const put = (k: string, v: unknown) => {
      if (v === undefined) return;
      if (v === null) return;
      if (typeof v === "string") {
        const s = v.trim();
        if (!s) return;
        profile[k] = s;
        return;
      }
      if (typeof v === "boolean") {
        profile[k] = v;
        return;
      }
      profile[k] = v;
    };

    put("fullName", trimmed(body.fullName));
    put("fatherName", trimmed(body.fatherName));
    put("gender", body.gender);
    put("dateOfBirth", trimmed(body.dateOfBirth));
    put("nationality", trimmed(body.nationality));
    put("nationalId", trimmed(body.nationalId));
    put("documentType", trimmed(body.documentType));
    put("documentNumber", trimmed(body.documentNumber));
    put("documentIssuer", trimmed(body.documentIssuer));
    put("documentExpiry", trimmed(body.documentExpiry));
    put("documentFrontFileId", trimmed(body.documentFrontFileId));
    put("documentBackFileId", trimmed(body.documentBackFileId));
    put("selfieFileId", trimmed(body.selfieFileId));
    put("address", trimmed(body.address));
    put("city", trimmed(body.city));
    put("country", trimmed(body.country));
    put("occupation", trimmed(body.occupation));
    put("sourceOfFunds", trimmed(body.sourceOfFunds));
    if (body.isPep !== undefined) put("isPep", body.isPep);
    put("riskLevel", body.riskLevel);
    put("note", trimmed(body.note));

    const fileIds = [trimmed(body.documentFrontFileId), trimmed(body.documentBackFileId), trimmed(body.selfieFileId)].filter(Boolean) as string[];
    if (fileIds.length > 0) {
      const files = await this.prisma.file.findMany({
        where: { id: { in: fileIds }, tenantId, purpose: "msp_customer_kyc_document" },
        select: { id: true }
      });
      const ok = new Set(files.map((f) => f.id));
      for (const fid of fileIds) {
        if (!ok.has(fid)) {
          throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
        }
      }
    }

    const existing = (
      await this.prisma.$queryRaw<Array<{ kycJson: unknown | null }>>(Prisma.sql`
        SELECT "kycJson" FROM "MspCustomer"
        WHERE "tenantId"=${tenantId} AND "id"=${id}::uuid
        LIMIT 1
      `)
    )[0];
    const baseProfile =
      existing?.kycJson && typeof existing.kycJson === "object" ? (existing.kycJson as Record<string, unknown>) : ({} as Record<string, unknown>);
    const mergedProfile = { ...baseProfile, ...profile };

    const status = body.status ?? null;
    const updates: Prisma.Sql[] = [];
    if (status) updates.push(Prisma.sql`"kycStatus"=${status}`);
    updates.push(Prisma.sql`"kycJson"=${JSON.stringify(mergedProfile)}::jsonb`);
    updates.push(Prisma.sql`"kycUpdatedAt"=NOW()`);
    if (status === "verified") {
      updates.push(Prisma.sql`"kycVerifiedAt"=COALESCE("kycVerifiedAt", NOW())`);
      updates.push(Prisma.sql`"kycVerifiedByUserId"=COALESCE("kycVerifiedByUserId", ${req.user.id})`);
    } else if (status) {
      updates.push(Prisma.sql`"kycVerifiedAt"=NULL`);
      updates.push(Prisma.sql`"kycVerifiedByUserId"=NULL`);
    }
    updates.push(Prisma.sql`"updatedAt"=NOW()`);
    updates.push(Prisma.sql`"updatedByUserId"=${req.user.id}`);

    await this.prisma.$executeRaw`
      UPDATE "MspCustomer" SET ${Prisma.join(updates, ", ")}
      WHERE "tenantId"=${tenantId} AND "id"=${id}::uuid
    `;

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: req.user.id,
        action: "msp.customer.kyc.update",
        entityType: "mspCustomer",
        entityId: id,
        metadataJson: { status: status ?? "unchanged", profile: mergedProfile } as Prisma.InputJsonValue
      }
    });

    return { data: { success: true } };
  }

  @Get("customers/:id/wallet")
  @RequirePermissions("msp.customers.view")
  async getCustomerWallet(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);
    await this.getCustomer(tenantId, id);

    const rows = await this.prisma.$queryRaw<Array<{ currencyCode: string; balance: Prisma.Decimal }>>(Prisma.sql`
      SELECT
        a."currencyCode",
        COALESCE(SUM(e."amountSigned"),0)::decimal(20,6) AS "balance"
      FROM "MspAccount" a
      LEFT JOIN "MspLedgerEntry" e ON e."tenantId"=a."tenantId" AND e."accountId"=a."id"
      WHERE a."tenantId"=${tenantId} AND a."type"='customer' AND a."customerId"=${id}::uuid
      GROUP BY a."currencyCode"
      ORDER BY a."currencyCode" ASC
    `);

    return { data: rows.map((r) => ({ currencyCode: r.currencyCode, balance: r.balance.toString() })) };
  }

  @Get("customers/wallets")
  @RequirePermissions("msp.customers.view")
  async getCustomerWallets(@Req() req: { tenantId: string }, @Query() query: GetMspCustomerWalletsQueryDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const ids = (query.ids ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200);
    const currencyCodes = (query.currencyCodes ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 20);

    const whereParts: Prisma.Sql[] = [Prisma.sql`a."tenantId"=${tenantId}`, Prisma.sql`a."type"='customer'`, Prisma.sql`a."customerId" IS NOT NULL`];
    if (ids.length > 0) whereParts.push(Prisma.sql`a."customerId"::text IN (${Prisma.join(ids)})`);
    if (currencyCodes.length > 0) whereParts.push(Prisma.sql`a."currencyCode" IN (${Prisma.join(currencyCodes)})`);
    const whereSql = Prisma.join(whereParts, " AND ");

    const rows = await this.prisma.$queryRaw<Array<{ customerId: string; currencyCode: string; balance: Prisma.Decimal }>>(Prisma.sql`
      SELECT
        a."customerId"::text AS "customerId",
        a."currencyCode",
        COALESCE(SUM(e."amountSigned"),0)::decimal(20,6) AS "balance"
      FROM "MspAccount" a
      LEFT JOIN "MspLedgerEntry" e ON e."tenantId"=a."tenantId" AND e."accountId"=a."id"
      WHERE ${whereSql}
      GROUP BY a."customerId", a."currencyCode"
      ORDER BY a."customerId" ASC, a."currencyCode" ASC
    `);

    const map = new Map<string, Record<string, string>>();
    for (const r of rows) {
      const cur = map.get(r.customerId) ?? {};
      cur[r.currencyCode] = r.balance.toString();
      map.set(r.customerId, cur);
    }

    return { data: ids.map((id) => ({ customerId: id, balances: map.get(id) ?? {} })) };
  }

  @Post("customers/:id/wallet/deposit")
  @RequirePermissions("msp.customers.manage")
  async depositToCustomerWallet(
    @Req() req: { tenantId: string; user: { id: string } },
    @Param("id") id: string,
    @Body() body: CreateMspCustomerWalletDepositDto
  ) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const currencyCode = body.currencyCode.trim().toUpperCase();
    await this.assertActiveCurrency(tenantId, currencyCode);

    const cashAccountId = body.cashAccountId.trim();
    if (!cashAccountId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    await this.assertActiveCashBankAccount(tenantId, cashAccountId, currencyCode);

    await this.getCustomer(tenantId, id);
    const amount = this.normalizeMoneyInput(body.amount);
    const entryDate = body.entryDate?.trim() ? this.parseIsoDateOnly(body.entryDate, false) : this.parseIsoDateOnly(undefined, true);
    const note = body.note?.trim() ? body.note.trim() : null;

    await this.prisma.$transaction(async (tx) => {
      const customerAccountId = await this.getOrCreateCustomerWalletAccount(tx, { tenantId, customerId: id, currencyCode, userId: req.user.id });
      await this.insertLedgerEntry(tx, { tenantId, accountId: cashAccountId, entryDate, source: "customer_deposit", ref: id, amountSigned: amount, note, userId: req.user.id });
      await this.insertLedgerEntry(tx, { tenantId, accountId: customerAccountId, entryDate, source: "customer_deposit", ref: id, amountSigned: amount, note, userId: req.user.id });
    });

    await this.prisma.auditLog.create({
      data: { tenantId, actorUserId: req.user.id, action: "msp.customer.wallet.deposit", entityType: "mspCustomer", entityId: id, metadataJson: { currencyCode, cashAccountId, amount: amount.toString(), entryDate, note } as Prisma.InputJsonValue }
    });

    return { data: { success: true } };
  }

  @Post("customers/:id/wallet/withdraw")
  @RequirePermissions("msp.customers.manage")
  async withdrawFromCustomerWallet(
    @Req() req: { tenantId: string; user: { id: string } },
    @Param("id") id: string,
    @Body() body: CreateMspCustomerWalletWithdrawDto
  ) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const currencyCode = body.currencyCode.trim().toUpperCase();
    await this.assertActiveCurrency(tenantId, currencyCode);

    const cashAccountId = body.cashAccountId.trim();
    if (!cashAccountId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    await this.assertActiveCashBankAccount(tenantId, cashAccountId, currencyCode);

    await this.getCustomer(tenantId, id);
    const amount = this.normalizeMoneyInput(body.amount);
    const entryDate = body.entryDate?.trim() ? this.parseIsoDateOnly(body.entryDate, false) : this.parseIsoDateOnly(undefined, true);
    const note = body.note?.trim() ? body.note.trim() : null;

    await this.prisma.$transaction(async (tx) => {
      const customerAccountId = await this.getOrCreateCustomerWalletAccount(tx, { tenantId, customerId: id, currencyCode, userId: req.user.id });
      await this.assertSufficientBalance(tx, tenantId, customerAccountId, amount);
      await this.assertSufficientBalance(tx, tenantId, cashAccountId, amount);
      await this.insertLedgerEntry(tx, { tenantId, accountId: cashAccountId, entryDate, source: "customer_withdraw", ref: id, amountSigned: amount.mul(-1), note, userId: req.user.id });
      await this.insertLedgerEntry(tx, { tenantId, accountId: customerAccountId, entryDate, source: "customer_withdraw", ref: id, amountSigned: amount.mul(-1), note, userId: req.user.id });
    });

    await this.prisma.auditLog.create({
      data: { tenantId, actorUserId: req.user.id, action: "msp.customer.wallet.withdraw", entityType: "mspCustomer", entityId: id, metadataJson: { currencyCode, cashAccountId, amount: amount.toString(), entryDate, note } as Prisma.InputJsonValue }
    });

    return { data: { success: true } };
  }

  @Get("branches")
  @RequirePermissions("msp.branches.view")
  async listBranches(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; name: string; code: string | null; address: string | null; isActive: boolean; updatedAt: Date }>
    >`SELECT "id","name","code","address","isActive","updatedAt" FROM "MspBranch" WHERE "tenantId"=${tenantId} ORDER BY "name" ASC`;

    return { data: rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })) };
  }

  @Post("branches")
  @RequirePermissions("msp.branches.manage")
  async createBranch(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: CreateMspBranchDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const name = body.name.trim();
    if (!name) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    const code = body.code?.trim() ? body.code.trim() : null;
    const address = body.address?.trim() ? body.address.trim() : null;
    const isActive = typeof body.isActive === "boolean" ? body.isActive : true;

    if (code) {
      const existing = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "MspBranch" WHERE "tenantId"=${tenantId} AND "code"=${code} LIMIT 1
      `;
      if (existing.length > 0) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const created = (await this.prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "MspBranch" ("tenantId","name","code","address","isActive","createdAt","updatedAt","createdByUserId","updatedByUserId")
      VALUES (${tenantId}, ${name}, ${code}, ${address}, ${isActive}, NOW(), NOW(), ${req.user.id}, ${req.user.id})
      RETURNING "id"
    `)[0];
    if (!created?.id) throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);
    return { data: { id: created.id } };
  }

  @Patch("branches/:id")
  @RequirePermissions("msp.branches.manage")
  async updateBranch(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: UpdateMspBranchDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const existing = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "MspBranch" WHERE "tenantId"=${tenantId} AND "id"=${id} LIMIT 1
    `;
    if (existing.length === 0) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const updates: Prisma.Sql[] = [];
    if (body.name !== undefined) updates.push(Prisma.sql`"name"=${body.name.trim()}`);
    if (body.code !== undefined) updates.push(Prisma.sql`"code"=${body.code?.trim() ? body.code.trim() : null}`);
    if (body.address !== undefined) updates.push(Prisma.sql`"address"=${body.address?.trim() ? body.address.trim() : null}`);
    if (body.isActive !== undefined) updates.push(Prisma.sql`"isActive"=${body.isActive}`);
    updates.push(Prisma.sql`"updatedAt"=NOW()`);
    updates.push(Prisma.sql`"updatedByUserId"=${req.user.id}`);

    await this.prisma.$executeRaw`
      UPDATE "MspBranch" SET ${Prisma.join(updates, ", ")}
      WHERE "tenantId"=${tenantId} AND "id"=${id}
    `;
    return { data: { success: true } };
  }

  @Get("hawala/partners")
  @RequirePermissions("msp.hawala.view")
  async listHawalaPartners(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const partners = await this.prisma.$queryRaw<
      Array<{ id: string; name: string; phone: string | null; isActive: boolean; updatedAt: Date }>
    >`SELECT "id","name","phone","isActive","updatedAt" FROM "MspHawalaPartner" WHERE "tenantId"=${tenantId} ORDER BY "name" ASC`;

    return { data: partners.map((p) => ({ ...p, updatedAt: p.updatedAt.toISOString() })) };
  }

  @Get("hawala/partners/balances")
  @RequirePermissions("msp.hawala.view")
  async listHawalaPartnerBalances(@Req() req: { tenantId: string }, @Query() query: GetMspPartnerBalancesQueryDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const ids = (query.ids ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200);
    const currencyCodes = (query.currencyCodes ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 20);

    const whereParts: Prisma.Sql[] = [Prisma.sql`a."tenantId"=${tenantId}`, Prisma.sql`a."type"='partner'`, Prisma.sql`a."partnerId" IS NOT NULL`];
    if (ids.length > 0) whereParts.push(Prisma.sql`a."partnerId"::text IN (${Prisma.join(ids)})`);
    if (currencyCodes.length > 0) whereParts.push(Prisma.sql`a."currencyCode" IN (${Prisma.join(currencyCodes)})`);
    const whereSql = Prisma.join(whereParts, " AND ");

    const rows = await this.prisma.$queryRaw<Array<{ partnerId: string; currencyCode: string; balance: Prisma.Decimal }>>(Prisma.sql`
      SELECT
        a."partnerId"::text AS "partnerId",
        a."currencyCode",
        COALESCE(SUM(e."amountSigned"),0)::decimal(20,6) AS "balance"
      FROM "MspAccount" a
      LEFT JOIN "MspLedgerEntry" e ON e."tenantId"=a."tenantId" AND e."accountId"=a."id"
      WHERE ${whereSql}
      GROUP BY a."partnerId", a."currencyCode"
      ORDER BY a."partnerId" ASC, a."currencyCode" ASC
    `);

    const map = new Map<string, Record<string, string>>();
    for (const r of rows) {
      const cur = map.get(r.partnerId) ?? {};
      cur[r.currencyCode] = r.balance.toString();
      map.set(r.partnerId, cur);
    }

    return { data: ids.map((id) => ({ partnerId: id, balances: map.get(id) ?? {} })) };
  }

  @Get("hawala/partners/:id/statement")
  @RequirePermissions("msp.hawala.view")
  async getHawalaPartnerStatement(@Req() req: { tenantId: string }, @Param("id") id: string, @Query() query: ListMspPartnerStatementQueryDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const partner = (await this.prisma.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT "id"::text AS "id","name" FROM "MspHawalaPartner" WHERE "tenantId"=${tenantId} AND "id"=${id} LIMIT 1
    `)[0];
    if (!partner) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const from = this.parseIsoDateOnlyOrNull(query.from);
    const to = this.parseIsoDateOnlyOrNull(query.to);
    const currencyCode = query.currencyCode?.trim() ? query.currencyCode.trim().toUpperCase() : null;

    const whereParts: Prisma.Sql[] = [
      Prisma.sql`e."tenantId"=${tenantId}`,
      Prisma.sql`a."type"='partner'`,
      Prisma.sql`a."partnerId"=${id}::uuid`
    ];
    if (from && to) whereParts.push(Prisma.sql`e."entryDate" BETWEEN ${from}::date AND ${to}::date`);
    else if (from) whereParts.push(Prisma.sql`e."entryDate" >= ${from}::date`);
    else if (to) whereParts.push(Prisma.sql`e."entryDate" <= ${to}::date`);
    if (currencyCode) whereParts.push(Prisma.sql`a."currencyCode"=${currencyCode}`);

    const whereSql = Prisma.join(whereParts, " AND ");
    const offset = (page - 1) * pageSize;

    const [rows, countRow] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          eventId: string;
          eventDate: Date;
          occurredAt: Date;
          source: string;
          ref: string | null;
          currencyCode: string;
          amountSigned: Prisma.Decimal;
          note: string | null;
          accountName: string;
        }>
      >(Prisma.sql`
        SELECT
          e."id"::text AS "eventId",
          e."entryDate" AS "eventDate",
          e."occurredAt" AS "occurredAt",
          e."source" AS "source",
          e."ref" AS "ref",
          a."currencyCode" AS "currencyCode",
          e."amountSigned" AS "amountSigned",
          e."note" AS "note",
          a."name" AS "accountName"
        FROM "MspLedgerEntry" e
        JOIN "MspAccount" a ON a."tenantId"=e."tenantId" AND a."id"=e."accountId"
        WHERE ${whereSql}
        ORDER BY e."occurredAt" DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "total"
        FROM "MspLedgerEntry" e
        JOIN "MspAccount" a ON a."tenantId"=e."tenantId" AND a."id"=e."accountId"
        WHERE ${whereSql}
      `)
    ]);

    return {
      data: {
        partner,
        page,
        pageSize,
        total: Number(countRow?.[0]?.total ?? 0),
        items: rows.map((r) => ({
          eventId: r.eventId,
          eventDate: r.eventDate.toISOString().slice(0, 10),
          occurredAt: r.occurredAt.toISOString(),
          source: r.source,
          ref: r.ref,
          currencyCode: r.currencyCode,
          amountSigned: r.amountSigned.toString(),
          note: r.note,
          accountName: r.accountName
        }))
      }
    };
  }

  @Post("hawala/partners")
  @RequirePermissions("msp.hawala.manage")
  async createHawalaPartner(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: CreateMspHawalaPartnerDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const name = body.name.trim();
    if (!name) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    const phone = body.phone?.trim() ? body.phone.trim() : null;
    const isActive = typeof body.isActive === "boolean" ? body.isActive : true;

    const created = (await this.prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "MspHawalaPartner" ("tenantId","name","phone","isActive","createdAt","updatedAt")
      VALUES (${tenantId}, ${name}, ${phone}, ${isActive}, NOW(), NOW())
      RETURNING "id"
    `)[0];
    if (!created?.id) throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);
    return { data: { id: created.id } };
  }

  @Patch("hawala/partners/:id")
  @RequirePermissions("msp.hawala.manage")
  async updateHawalaPartner(@Req() req: { tenantId: string }, @Param("id") id: string, @Body() body: UpdateMspHawalaPartnerDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const existing = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "MspHawalaPartner" WHERE "tenantId"=${tenantId} AND "id"=${id} LIMIT 1
    `;
    if (existing.length === 0) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const updates: Prisma.Sql[] = [];
    if (body.name !== undefined) updates.push(Prisma.sql`"name"=${body.name.trim()}`);
    if (body.phone !== undefined) updates.push(Prisma.sql`"phone"=${body.phone?.trim() ? body.phone.trim() : null}`);
    if (body.isActive !== undefined) updates.push(Prisma.sql`"isActive"=${body.isActive}`);
    updates.push(Prisma.sql`"updatedAt"=NOW()`);

    await this.prisma.$executeRaw`
      UPDATE "MspHawalaPartner" SET ${Prisma.join(updates, ", ")}
      WHERE "tenantId"=${tenantId} AND "id"=${id}
    `;
    return { data: { success: true } };
  }

  @Get("hawala/transfers")
  @RequirePermissions("msp.hawala.view")
  async listHawalaTransfers(@Req() req: { tenantId: string }, @Query() query: ListMspHawalaTransfersQueryDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const q = query.q?.trim() ? query.q.trim().toLowerCase() : null;
    const status = query.status?.trim() ? query.status.trim() : null;
    const from = query.from?.trim() ? this.parseIsoDateOnly(query.from, false) : null;
    const to = query.to?.trim() ? this.parseIsoDateOnly(query.to, false) : null;

    const whereParts: Prisma.Sql[] = [Prisma.sql`"tenantId"=${tenantId}`];
    if (status) whereParts.push(Prisma.sql`"status"=${status}`);
    if (from && to) whereParts.push(Prisma.sql`"transferDate" BETWEEN ${from}::date AND ${to}::date`);
    else if (from) whereParts.push(Prisma.sql`"transferDate" >= ${from}::date`);
    else if (to) whereParts.push(Prisma.sql`"transferDate" <= ${to}::date`);
    if (q) {
      whereParts.push(
        Prisma.sql`(LOWER(COALESCE("senderName",'')) LIKE ${"%" + q + "%"} OR LOWER(COALESCE("receiverName",'')) LIKE ${"%" + q + "%"} OR LOWER(COALESCE("senderPhone",'')) LIKE ${"%" + q + "%"} OR LOWER(COALESCE("receiverPhone",'')) LIKE ${"%" + q + "%"} OR CAST("transferNumber" AS TEXT) LIKE ${"%" + q + "%"})`
      );
    }
    const whereSql = Prisma.join(whereParts, " AND ");
    const offset = (page - 1) * pageSize;

    const [rows, countRow] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          id: string;
          transferNumber: number;
          status: string;
          transferDate: Date;
          currencyCode: string;
          amount: Prisma.Decimal;
          fee: Prisma.Decimal;
          total: Prisma.Decimal;
          senderName: string;
          senderPhone: string | null;
          receiverName: string;
          receiverPhone: string | null;
          partnerId: string | null;
          createdAt: Date;
        }>
      >(Prisma.sql`
        SELECT "id","transferNumber","status","transferDate","currencyCode","amount","fee","total","senderName","senderPhone","receiverName","receiverPhone","partnerId","createdAt"
        FROM "MspHawalaTransfer"
        WHERE ${whereSql}
        ORDER BY "transferNumber" DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "total" FROM "MspHawalaTransfer" WHERE ${whereSql}
      `)
    ]);

    return {
      data: {
        page,
        pageSize,
        total: Number(countRow?.[0]?.total ?? 0),
        items: rows.map((r) => ({
          id: r.id,
          transferNumber: r.transferNumber,
          status: r.status,
          transferDate: r.transferDate.toISOString().slice(0, 10),
          currencyCode: r.currencyCode,
          amount: r.amount.toString(),
          fee: r.fee.toString(),
          total: r.total.toString(),
          senderName: r.senderName,
          senderPhone: r.senderPhone,
          receiverName: r.receiverName,
          receiverPhone: r.receiverPhone,
          partnerId: r.partnerId,
          createdAt: r.createdAt.toISOString()
        }))
      }
    };
  }

  @Post("hawala/transfers")
  @RequirePermissions("msp.hawala.manage")
  async createHawalaTransfer(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: CreateMspHawalaTransferDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const currencyCode = body.currencyCode.trim().toUpperCase();
    await this.assertActiveCurrency(tenantId, currencyCode);

    const amount = this.normalizeMoneyInput(body.amount);
    const fee = body.fee !== undefined ? this.normalizeMoneyInput(body.fee, true) : new Prisma.Decimal(0);
    const total = amount.add(fee);

    const compliance = await this.getCompliancePolicyFromDb(this.prisma.$queryRaw, tenantId);
    const kycThreshold = this.parseDecimalFromPolicy(compliance.kyc.requiredAboveByCurrency, currencyCode, new Prisma.Decimal("999999999999"));
    const kycAboveThreshold = total.gte(kycThreshold);

    const fundingSource = body.fundingSource ?? "cash";
    const customerId = body.customerId?.trim() ? body.customerId.trim() : null;
    const receiveAccountId = body.receiveAccountId?.trim() ? body.receiveAccountId.trim() : null;
    if (fundingSource === "cash") {
      if (!receiveAccountId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      await this.assertActiveCashBankAccount(tenantId, receiveAccountId, currencyCode);
    } else {
      if (!customerId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      await this.getCustomer(tenantId, customerId);
    }

    if (compliance.kyc.enforceMode === "above_threshold" && kycAboveThreshold && compliance.kyc.requireCustomerAboveThreshold && !customerId) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.kycCustomerRequired" } }, 400);
    }
    if (customerId && fundingSource === "cash") {
      await this.getCustomer(tenantId, customerId);
    }

    const requireVerifiedKyc = compliance.kyc.enforceMode === "always" ? !!customerId : kycAboveThreshold && !!customerId;
    if (customerId && requireVerifiedKyc) {
      const row = (
        await this.prisma.$queryRaw<Array<{ kycStatus: string }>>(Prisma.sql`
          SELECT "kycStatus" FROM "MspCustomer"
          WHERE "tenantId"=${tenantId} AND "id"=${customerId}::uuid
          LIMIT 1
        `)
      )[0];
      const kycStatus = row?.kycStatus ?? "none";
      if (kycStatus !== "verified") {
        throw new HttpException({ error: { code: "KYC_REQUIRED", message_key: "errors.kycRequired" } }, 403);
      }
    }

    const senderName = body.senderName.trim();
    const receiverName = body.receiverName.trim();
    if (!senderName || !receiverName) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const senderPhone = body.senderPhone?.trim() ? body.senderPhone.trim() : null;
    const receiverPhone = body.receiverPhone?.trim() ? body.receiverPhone.trim() : null;
    const partnerId = body.partnerId?.trim() ? body.partnerId.trim() : null;
    let partnerName: string | null = null;
    const note = body.note?.trim() ? body.note.trim() : null;
    const transferDate = body.transferDate?.trim() ? this.parseIsoDateOnly(body.transferDate, false) : this.parseIsoDateOnly(undefined, true);

    if (partnerId) {
      const partner = await this.prisma.$queryRaw<Array<{ id: string; name: string }>>`
        SELECT "id","name" FROM "MspHawalaPartner" WHERE "tenantId"=${tenantId} AND "id"=${partnerId} AND "isActive"=TRUE LIMIT 1
      `;
      if (partner.length === 0) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      partnerName = partner[0]?.name ?? null;
    }

    const id = await this.prisma.$transaction(async (tx) => {
      const hawalaPayableAccountId = partnerId
        ? await this.getOrCreatePartnerAccount(tx, { tenantId, partnerId, partnerName: partnerName ?? "Partner", currencyCode, userId: req.user.id })
        : await this.getOrCreateSystemAccount(tx, {
            tenantId,
            systemCode: "hawala_payable",
            currencyCode,
            name: `Hawala payable (${currencyCode})`,
            userId: req.user.id
          });
      const hawalaFeeIncomeAccountId =
        fee.gt(0)
          ? await this.getOrCreateSystemAccount(tx, {
              tenantId,
              systemCode: "hawala_fee_income",
              currencyCode,
              name: `Hawala fee income (${currencyCode})`,
              userId: req.user.id
            })
          : null;

      const seqRow = (await tx.$queryRaw<Array<{ transferNumber: number }>>`
        UPDATE "MspSettings"
        SET "nextHawalaTransferNumber"="nextHawalaTransferNumber"+1, "updatedAt"=NOW()
        WHERE "tenantId"=${tenantId}
        RETURNING ("nextHawalaTransferNumber" - 1) AS "transferNumber"
      `)[0];
      const transferNumber = seqRow?.transferNumber ?? 1;

      const created = (await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "MspHawalaTransfer" ("tenantId","transferNumber","status","transferDate","currencyCode","amount","fee","total","senderName","senderPhone","receiverName","receiverPhone","partnerId","note","receiveAccountId","customerId","fundingSource","createdAt","createdByUserId")
        VALUES (${tenantId}, ${transferNumber}, 'open', ${transferDate}::date, ${currencyCode}, ${amount}, ${fee}, ${total}, ${senderName}, ${senderPhone}, ${receiverName}, ${receiverPhone}, ${partnerId}::uuid, ${note}, ${receiveAccountId}::uuid, ${customerId}::uuid, ${fundingSource}, NOW(), ${req.user.id})
        RETURNING "id"
      `)[0];
      if (!created?.id) throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);

      if (fundingSource === "cash" && receiveAccountId) {
        await this.insertLedgerEntry(tx, {
          tenantId,
          accountId: receiveAccountId,
          entryDate: transferDate,
          source: "hawala_transfer",
          ref: created.id,
          amountSigned: total,
          note,
          userId: req.user.id
        });
      }
      if (fundingSource === "customer_wallet" && customerId) {
        const customerAccountId = await this.getOrCreateCustomerWalletAccount(tx, { tenantId, customerId, currencyCode, userId: req.user.id });
        await this.assertSufficientBalance(tx, tenantId, customerAccountId, total);
        await this.insertLedgerEntry(tx, {
          tenantId,
          accountId: customerAccountId,
          entryDate: transferDate,
          source: "hawala_transfer",
          ref: created.id,
          amountSigned: total.mul(-1),
          note,
          userId: req.user.id
        });
      }
      await this.insertLedgerEntry(tx, {
        tenantId,
        accountId: hawalaPayableAccountId,
        entryDate: transferDate,
        source: "hawala_transfer",
        ref: created.id,
        amountSigned: amount,
        note,
        userId: req.user.id
      });
      if (hawalaFeeIncomeAccountId && fee.gt(0)) {
        await this.insertLedgerEntry(tx, {
          tenantId,
          accountId: hawalaFeeIncomeAccountId,
          entryDate: transferDate,
          source: "hawala_transfer",
          ref: created.id,
          amountSigned: fee,
          note,
          userId: req.user.id
        });
      }

      if (customerId) {
        await this.evaluateAmlForCustomerTxn(tx, {
          tenantId,
          sourceType: "hawala_transfer",
          sourceId: created.id,
          txnDate: transferDate,
          customerId,
          currencyCode,
          amount: total
        });
      }
      return created.id;
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: req.user.id,
        action: "msp.hawala.transfer.create",
        entityType: "mspHawalaTransfer",
        entityId: id,
        metadataJson: { currencyCode, amount: amount.toString(), fee: fee.toString(), total: total.toString(), transferDate, senderName, senderPhone, receiverName, receiverPhone, partnerId, note, receiveAccountId, fundingSource, customerId } as Prisma.InputJsonValue
      }
    });

    return { data: { id } };
  }

  @Get("hawala/transfers/:id")
  @RequirePermissions("msp.hawala.view")
  async getHawalaTransfer(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        transferNumber: number;
        status: string;
        transferDate: Date;
        currencyCode: string;
        amount: Prisma.Decimal;
        fee: Prisma.Decimal;
        total: Prisma.Decimal;
        senderName: string;
        senderPhone: string | null;
        receiverName: string;
        receiverPhone: string | null;
        partnerId: string | null;
        partnerName: string | null;
        receiveAccountId: string | null;
        customerId: string | null;
        customerName: string | null;
        fundingSource: string | null;
        note: string | null;
        createdAt: Date;
      }>
    >(
      Prisma.sql`
        SELECT t."id",t."transferNumber",t."status",t."transferDate",t."currencyCode",t."amount",t."fee",t."total",
               t."senderName",t."senderPhone",t."receiverName",t."receiverPhone",t."partnerId",p."name" AS "partnerName",
               t."receiveAccountId"::text AS "receiveAccountId",
               t."customerId"::text AS "customerId",
               c."name" AS "customerName",
               t."fundingSource",
               t."note",t."createdAt"
        FROM "MspHawalaTransfer" t
        LEFT JOIN "MspHawalaPartner" p ON p."id" = t."partnerId" AND p."tenantId" = t."tenantId"
        LEFT JOIN "MspCustomer" c ON c."id" = t."customerId" AND c."tenantId" = t."tenantId"
        WHERE t."tenantId"=${tenantId} AND t."id"=${id}
        LIMIT 1
      `
    );
    const r = rows[0];
    if (!r) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const payouts = await this.prisma.$queryRaw<
      Array<{ id: string; paidAmount: Prisma.Decimal; paidAt: Date; paidByUserId: string | null; payAccountId: string | null; note: string | null }>
    >`SELECT "id","paidAmount","paidAt","paidByUserId","payAccountId"::text AS "payAccountId","note" FROM "MspHawalaPayout" WHERE "tenantId"=${tenantId} AND "transferId"=${id}::uuid ORDER BY "paidAt" ASC`;
    const paidTotal = payouts.reduce((acc, p) => acc.add(p.paidAmount), new Prisma.Decimal(0));
    const remaining = new Prisma.Decimal(r.amount).sub(paidTotal);

    return {
      data: {
        id: r.id,
        transferNumber: r.transferNumber,
        status: r.status,
        transferDate: r.transferDate.toISOString().slice(0, 10),
        currencyCode: r.currencyCode,
        amount: r.amount.toString(),
        fee: r.fee.toString(),
        total: r.total.toString(),
        senderName: r.senderName,
        senderPhone: r.senderPhone,
        receiverName: r.receiverName,
        receiverPhone: r.receiverPhone,
        partnerId: r.partnerId,
        partnerName: r.partnerName,
        receiveAccountId: r.receiveAccountId,
        customerId: r.customerId,
        customerName: r.customerName,
        fundingSource: r.fundingSource,
        note: r.note,
        createdAt: r.createdAt.toISOString(),
        paidTotal: paidTotal.toString(),
        remaining: remaining.isNeg() ? "0" : remaining.toString(),
        payouts: payouts.map((p) => ({
          id: p.id,
          paidAmount: p.paidAmount.toString(),
          paidAt: p.paidAt.toISOString(),
          paidByUserId: p.paidByUserId,
          payAccountId: p.payAccountId,
          note: p.note
        }))
      }
    };
  }

  @Post("hawala/transfers/:id/payouts")
  @RequirePermissions("msp.hawala.manage")
  async addHawalaPayout(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: CreateMspHawalaPayoutDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    await this.prisma.$transaction(async (tx) => {
      const transferRows = await tx.$queryRaw<
        Array<{ status: string; amount: Prisma.Decimal; currencyCode: string; receiveAccountId: string | null; partnerId: string | null; partnerName: string | null }>
      >(
        Prisma.sql`
          SELECT t."status",t."amount",t."currencyCode",t."receiveAccountId"::text AS "receiveAccountId",t."partnerId"::text AS "partnerId",p."name" AS "partnerName"
          FROM "MspHawalaTransfer" t
          LEFT JOIN "MspHawalaPartner" p ON p."tenantId"=t."tenantId" AND p."id"=t."partnerId"
          WHERE t."tenantId"=${tenantId} AND t."id"=${id}
          LIMIT 1
        `
      );
      const transfer = transferRows[0];
      if (!transfer) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
      if (transfer.status === "cancelled") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

      const payouts = await tx.$queryRaw<Array<{ paidAmount: Prisma.Decimal }>>`
        SELECT "paidAmount" FROM "MspHawalaPayout" WHERE "tenantId"=${tenantId} AND "transferId"=${id}::uuid
      `;
      const paidTotal = payouts.reduce((acc, p) => acc.add(p.paidAmount), new Prisma.Decimal(0));
      const remaining = new Prisma.Decimal(transfer.amount).sub(paidTotal);
      const remainingSafe = remaining.isNeg() ? new Prisma.Decimal(0) : remaining;
      if (remainingSafe.lte(0)) {
        await tx.$executeRaw`UPDATE "MspHawalaTransfer" SET "status"='paid' WHERE "tenantId"=${tenantId} AND "id"=${id}`;
        throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      }

      const paidAmount = body.paidAmount !== undefined ? this.normalizeMoneyInput(body.paidAmount) : remainingSafe;
      if (paidAmount.gt(remainingSafe)) {
        throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      }
      const payAccountId = body.payAccountId?.trim() ? body.payAccountId.trim() : transfer.receiveAccountId;
      if (!payAccountId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      await this.assertActiveCashBankAccount(tenantId, payAccountId, transfer.currencyCode);
      const note = body.note?.trim() ? body.note.trim() : null;

      await this.assertSufficientBalance(tx, tenantId, payAccountId, paidAmount);

      const payout = (await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "MspHawalaPayout" ("tenantId","transferId","paidAmount","paidAt","paidByUserId","note","payAccountId")
        VALUES (${tenantId}, ${id}::uuid, ${paidAmount}, NOW(), ${req.user.id}, ${note}, ${payAccountId}::uuid)
        RETURNING "id"
      `)[0];
      if (!payout?.id) throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);

      const entryDate = this.parseIsoDateOnly(undefined, true);
      await this.insertLedgerEntry(tx, {
        tenantId,
        accountId: payAccountId,
        entryDate,
        source: "hawala_payout",
        ref: payout.id,
        amountSigned: paidAmount.mul(-1),
        note,
        userId: req.user.id
      });
      const hawalaPayableAccountId = transfer.partnerId
        ? await this.getOrCreatePartnerAccount(tx, {
            tenantId,
            partnerId: transfer.partnerId,
            partnerName: transfer.partnerName ?? "Partner",
            currencyCode: transfer.currencyCode,
            userId: req.user.id
          })
        : await this.getOrCreateSystemAccount(tx, {
            tenantId,
            systemCode: "hawala_payable",
            currencyCode: transfer.currencyCode,
            name: `Hawala payable (${transfer.currencyCode})`,
            userId: req.user.id
          });
      await this.insertLedgerEntry(tx, {
        tenantId,
        accountId: hawalaPayableAccountId,
        entryDate,
        source: "hawala_payout",
        ref: payout.id,
        amountSigned: paidAmount.mul(-1),
        note,
        userId: req.user.id
      });

      const newPaid = paidTotal.add(paidAmount);
      const newRemaining = new Prisma.Decimal(transfer.amount).sub(newPaid);
      if (newRemaining.lte(0)) {
        await tx.$executeRaw`UPDATE "MspHawalaTransfer" SET "status"='paid' WHERE "tenantId"=${tenantId} AND "id"=${id}`;
      } else {
        await tx.$executeRaw`UPDATE "MspHawalaTransfer" SET "status"='open' WHERE "tenantId"=${tenantId} AND "id"=${id}`;
      }
    });

    await this.prisma.auditLog.create({
      data: { tenantId, actorUserId: req.user.id, action: "msp.hawala.payout.create", entityType: "mspHawalaTransfer", entityId: id, metadataJson: { transferId: id, paidAmount: body.paidAmount ?? null, payAccountId: body.payAccountId ?? null, note: body.note ?? null } }
    });

    return { data: { success: true } };
  }

  @Post("maintenance/repair-hawala-payable-fee")
  @RequirePermissions("msp.ledger.manage")
  async repairHawalaPayableFee(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: RepairMspHawalaPayableFeeDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const from = body.from?.trim() ? this.parseIsoDateOnly(body.from, false) : null;
    const to = body.to?.trim() ? this.parseIsoDateOnly(body.to, false) : null;
    const dryRun = body.dryRun === true;

    const transfers = await this.prisma.$queryRaw<
      Array<{ id: string; transferDate: Date; currencyCode: string; amount: Prisma.Decimal; fee: Prisma.Decimal }>
    >(Prisma.sql`
      SELECT "id","transferDate","currencyCode","amount","fee"
      FROM "MspHawalaTransfer"
      WHERE "tenantId"=${tenantId}
        AND "fee" > 0
        ${from ? Prisma.sql`AND "transferDate" >= ${from}::date` : Prisma.empty}
        ${to ? Prisma.sql`AND "transferDate" <= ${to}::date` : Prisma.empty}
      ORDER BY "transferDate" ASC
    `);

    const results: Array<{ transferId: string; currencyCode: string; fee: string; repairedFee: string }> = [];

    for (const tr of transfers) {
      const currencyCode = tr.currencyCode;
      const fee = new Prisma.Decimal(tr.fee);
      if (fee.lte(0)) continue;

      const { payableAccountId, feeIncomeAccountId, sumAdjusted } = await this.prisma.$transaction(async (tx) => {
        const payableAccountId = await this.getOrCreateSystemAccount(tx, {
          tenantId,
          systemCode: "hawala_payable",
          currencyCode,
          name: `Hawala payable (${currencyCode})`,
          userId: req.user.id
        });
        const feeIncomeAccountId = await this.getOrCreateSystemAccount(tx, {
          tenantId,
          systemCode: "hawala_fee_income",
          currencyCode,
          name: `Hawala fee income (${currencyCode})`,
          userId: req.user.id
        });

        const sumRow = (await tx.$queryRaw<Array<{ sumAdjusted: Prisma.Decimal }>>(Prisma.sql`
          SELECT COALESCE(SUM(e."amountSigned"),0)::decimal(20,6) AS "sumAdjusted"
          FROM "MspLedgerEntry" e
          WHERE e."tenantId"=${tenantId}
            AND e."accountId"=${payableAccountId}::uuid
            AND e."ref"=${tr.id}
            AND e."source" IN ('hawala_transfer','hawala_repair_fee')
        `))[0];
        const sumAdjusted = sumRow?.sumAdjusted ?? new Prisma.Decimal(0);

        return { payableAccountId, feeIncomeAccountId, sumAdjusted };
      });

      const expected = new Prisma.Decimal(tr.amount);
      const diff = new Prisma.Decimal(sumAdjusted).sub(expected);

      if (diff.lte(0)) continue;
      if (diff.sub(fee).abs().gt(new Prisma.Decimal("0.000001"))) continue;

      if (!dryRun) {
        await this.prisma.$transaction(async (tx) => {
          const entryDate = tr.transferDate.toISOString().slice(0, 10);
          await this.insertLedgerEntry(tx, {
            tenantId,
            accountId: payableAccountId,
            entryDate,
            source: "hawala_repair_fee",
            ref: tr.id,
            amountSigned: diff.mul(-1),
            note: "Repair hawala payable fee",
            userId: req.user.id
          });
          await this.insertLedgerEntry(tx, {
            tenantId,
            accountId: feeIncomeAccountId,
            entryDate,
            source: "hawala_repair_fee",
            ref: tr.id,
            amountSigned: diff,
            note: "Repair hawala payable fee",
            userId: req.user.id
          });
        });
      }

      results.push({ transferId: tr.id, currencyCode, fee: fee.toString(), repairedFee: diff.toString() });
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: req.user.id,
        action: "msp.maintenance.repair_hawala_payable_fee",
        entityType: "mspMaintenance",
        entityId: "repair-hawala-payable-fee",
        metadataJson: { from, to, dryRun, scanned: transfers.length, repaired: results.length } as Prisma.InputJsonValue
      }
    });

    return { data: { dryRun, scanned: transfers.length, repaired: results.length, items: results } };
  }

  @Post("maintenance/backfill-ledger")
  @RequirePermissions("msp.ledger.manage")
  async backfillLedger(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: BackfillMspLedgerDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const from = body.from?.trim() ? this.parseIsoDateOnly(body.from, false) : null;
    const to = body.to?.trim() ? this.parseIsoDateOnly(body.to, false) : null;
    const dryRun = body.dryRun === true;

    const stats = {
      exchangeTickets: { scanned: 0, backfilled: 0, skippedExisting: 0, skippedMissingAccounts: 0 },
      hawalaTransfers: { scanned: 0, backfilled: 0, skippedExisting: 0, skippedMissingAccounts: 0 },
      hawalaPayouts: { scanned: 0, backfilled: 0, skippedExisting: 0, skippedMissingAccounts: 0 },
      settlements: { scanned: 0, backfilled: 0, skippedExisting: 0, skippedMissingAccounts: 0 }
    };

    const ticketRows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        type: string;
        effectiveDate: Date;
        quoteAmount: Prisma.Decimal;
        baseAmount: Prisma.Decimal;
        feeBase: Prisma.Decimal;
        note: string | null;
        baseAccountId: string | null;
        quoteAccountId: string | null;
      }>
    >(Prisma.sql`
      SELECT
        t."id",t."type",t."effectiveDate",t."quoteAmount",t."baseAmount",t."feeBase",t."note",
        t."baseAccountId"::text AS "baseAccountId",
        t."quoteAccountId"::text AS "quoteAccountId"
      FROM "MspExchangeTicket" t
      WHERE t."tenantId"=${tenantId}
        ${from ? Prisma.sql`AND t."effectiveDate" >= ${from}::date` : Prisma.empty}
        ${to ? Prisma.sql`AND t."effectiveDate" <= ${to}::date` : Prisma.empty}
      ORDER BY t."effectiveDate" ASC
    `);

    for (const t of ticketRows) {
      stats.exchangeTickets.scanned += 1;
      const existsRow = (await this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "total" FROM "MspLedgerEntry"
        WHERE "tenantId"=${tenantId} AND "source"='exchange_ticket' AND "ref"=${t.id}
      `))[0];
      if (Number(existsRow?.total ?? 0) > 0) {
        stats.exchangeTickets.skippedExisting += 1;
        continue;
      }
      if (!t.baseAccountId || !t.quoteAccountId) {
        stats.exchangeTickets.skippedMissingAccounts += 1;
        continue;
      }

      if (!dryRun) {
        await this.prisma.$transaction(async (tx) => {
          const entryDate = t.effectiveDate.toISOString().slice(0, 10);
          const totalBase = new Prisma.Decimal(t.baseAmount).add(new Prisma.Decimal(t.feeBase));
          if (t.type === "buy") {
            await this.insertLedgerEntry(tx, { tenantId, accountId: t.quoteAccountId!, entryDate, source: "exchange_ticket", ref: t.id, amountSigned: new Prisma.Decimal(t.quoteAmount), note: t.note, userId: req.user.id });
            await this.insertLedgerEntry(tx, { tenantId, accountId: t.baseAccountId!, entryDate, source: "exchange_ticket", ref: t.id, amountSigned: totalBase.mul(-1), note: t.note, userId: req.user.id });
          } else {
            await this.insertLedgerEntry(tx, { tenantId, accountId: t.baseAccountId!, entryDate, source: "exchange_ticket", ref: t.id, amountSigned: totalBase, note: t.note, userId: req.user.id });
            await this.insertLedgerEntry(tx, { tenantId, accountId: t.quoteAccountId!, entryDate, source: "exchange_ticket", ref: t.id, amountSigned: new Prisma.Decimal(t.quoteAmount).mul(-1), note: t.note, userId: req.user.id });
          }
        });
      }
      stats.exchangeTickets.backfilled += 1;
    }

    const transferRows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        transferDate: Date;
        currencyCode: string;
        amount: Prisma.Decimal;
        fee: Prisma.Decimal;
        total: Prisma.Decimal;
        note: string | null;
        receiveAccountId: string | null;
        customerId: string | null;
        partnerId: string | null;
        partnerName: string | null;
        fundingSource: string | null;
      }>
    >(Prisma.sql`
      SELECT
        t."id",t."transferDate",t."currencyCode",t."amount",t."fee",t."total",t."note",
        t."receiveAccountId"::text AS "receiveAccountId",
        t."customerId"::text AS "customerId",
        t."partnerId"::text AS "partnerId",
        p."name" AS "partnerName",
        t."fundingSource"
      FROM "MspHawalaTransfer" t
      LEFT JOIN "MspHawalaPartner" p ON p."tenantId"=t."tenantId" AND p."id"=t."partnerId"
      WHERE t."tenantId"=${tenantId}
        ${from ? Prisma.sql`AND t."transferDate" >= ${from}::date` : Prisma.empty}
        ${to ? Prisma.sql`AND t."transferDate" <= ${to}::date` : Prisma.empty}
      ORDER BY t."transferDate" ASC
    `);

    for (const tr of transferRows) {
      stats.hawalaTransfers.scanned += 1;
      const existsRow = (await this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "total" FROM "MspLedgerEntry"
        WHERE "tenantId"=${tenantId} AND "source"='hawala_transfer' AND "ref"=${tr.id}
      `))[0];
      if (Number(existsRow?.total ?? 0) > 0) {
        stats.hawalaTransfers.skippedExisting += 1;
        continue;
      }

      const currencyCode = tr.currencyCode;
      const amount = new Prisma.Decimal(tr.amount);
      const fee = new Prisma.Decimal(tr.fee);
      const total = new Prisma.Decimal(tr.total);
      const fundingSource = (tr.fundingSource ?? (tr.customerId ? "customer_wallet" : "cash")) as "cash" | "customer_wallet";

      if (fundingSource === "cash" && !tr.receiveAccountId) {
        stats.hawalaTransfers.skippedMissingAccounts += 1;
        continue;
      }
      if (fundingSource === "customer_wallet" && !tr.customerId) {
        stats.hawalaTransfers.skippedMissingAccounts += 1;
        continue;
      }

      if (!dryRun) {
        await this.prisma.$transaction(async (tx) => {
          const entryDate = tr.transferDate.toISOString().slice(0, 10);
          const hawalaPayableAccountId = tr.partnerId
            ? await this.getOrCreatePartnerAccount(tx, {
                tenantId,
                partnerId: tr.partnerId,
                partnerName: tr.partnerName ?? "Partner",
                currencyCode,
                userId: req.user.id
              })
            : await this.getOrCreateSystemAccount(tx, {
                tenantId,
                systemCode: "hawala_payable",
                currencyCode,
                name: `Hawala payable (${currencyCode})`,
                userId: req.user.id
              });
          const hawalaFeeIncomeAccountId =
            fee.gt(0)
              ? await this.getOrCreateSystemAccount(tx, {
                  tenantId,
                  systemCode: "hawala_fee_income",
                  currencyCode,
                  name: `Hawala fee income (${currencyCode})`,
                  userId: req.user.id
                })
              : null;

          if (fundingSource === "cash") {
            await this.insertLedgerEntry(tx, { tenantId, accountId: tr.receiveAccountId!, entryDate, source: "hawala_transfer", ref: tr.id, amountSigned: total, note: tr.note, userId: req.user.id });
          } else {
            const customerWalletAccountId = await this.getOrCreateCustomerWalletAccount(tx, { tenantId, customerId: tr.customerId!, currencyCode, userId: req.user.id });
            await this.insertLedgerEntry(tx, { tenantId, accountId: customerWalletAccountId, entryDate, source: "hawala_transfer", ref: tr.id, amountSigned: total.mul(-1), note: tr.note, userId: req.user.id });
          }

          await this.insertLedgerEntry(tx, { tenantId, accountId: hawalaPayableAccountId, entryDate, source: "hawala_transfer", ref: tr.id, amountSigned: amount, note: tr.note, userId: req.user.id });
          if (hawalaFeeIncomeAccountId && fee.gt(0)) {
            await this.insertLedgerEntry(tx, { tenantId, accountId: hawalaFeeIncomeAccountId, entryDate, source: "hawala_transfer", ref: tr.id, amountSigned: fee, note: tr.note, userId: req.user.id });
          }
        });
      }
      stats.hawalaTransfers.backfilled += 1;
    }

    const payoutRows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        paidAmount: Prisma.Decimal;
        paidAt: Date;
        note: string | null;
        payAccountId: string | null;
        currencyCode: string;
        partnerId: string | null;
        partnerName: string | null;
      }>
    >(Prisma.sql`
      SELECT
        p."id",p."paidAmount",p."paidAt",p."note",p."payAccountId"::text AS "payAccountId",
        t."currencyCode",
        t."partnerId"::text AS "partnerId",
        pr."name" AS "partnerName"
      FROM "MspHawalaPayout" p
      JOIN "MspHawalaTransfer" t ON t."tenantId"=p."tenantId" AND t."id"=p."transferId"
      LEFT JOIN "MspHawalaPartner" pr ON pr."tenantId"=t."tenantId" AND pr."id"=t."partnerId"
      WHERE p."tenantId"=${tenantId}
        ${from ? Prisma.sql`AND p."paidAt" >= ${from}::date` : Prisma.empty}
        ${to ? Prisma.sql`AND p."paidAt" <= (${to}::date + INTERVAL '1 day')` : Prisma.empty}
      ORDER BY p."paidAt" ASC
    `);

    for (const p of payoutRows) {
      stats.hawalaPayouts.scanned += 1;
      const existsRow = (await this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "total" FROM "MspLedgerEntry"
        WHERE "tenantId"=${tenantId} AND "source"='hawala_payout' AND "ref"=${p.id}
      `))[0];
      if (Number(existsRow?.total ?? 0) > 0) {
        stats.hawalaPayouts.skippedExisting += 1;
        continue;
      }
      if (!p.payAccountId) {
        stats.hawalaPayouts.skippedMissingAccounts += 1;
        continue;
      }

      if (!dryRun) {
        await this.prisma.$transaction(async (tx) => {
          const entryDate = p.paidAt.toISOString().slice(0, 10);
          const hawalaPayableAccountId = p.partnerId
            ? await this.getOrCreatePartnerAccount(tx, {
                tenantId,
                partnerId: p.partnerId,
                partnerName: p.partnerName ?? "Partner",
                currencyCode: p.currencyCode,
                userId: req.user.id
              })
            : await this.getOrCreateSystemAccount(tx, {
                tenantId,
                systemCode: "hawala_payable",
                currencyCode: p.currencyCode,
                name: `Hawala payable (${p.currencyCode})`,
                userId: req.user.id
              });
          await this.insertLedgerEntry(tx, { tenantId, accountId: p.payAccountId!, entryDate, source: "hawala_payout", ref: p.id, amountSigned: new Prisma.Decimal(p.paidAmount).mul(-1), note: p.note, userId: req.user.id });
          await this.insertLedgerEntry(tx, { tenantId, accountId: hawalaPayableAccountId, entryDate, source: "hawala_payout", ref: p.id, amountSigned: new Prisma.Decimal(p.paidAmount).mul(-1), note: p.note, userId: req.user.id });
        });
      }
      stats.hawalaPayouts.backfilled += 1;
    }

    const settlementRows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        settlementDate: Date;
        partnerId: string;
        partnerName: string | null;
        currencyCode: string;
        amount: Prisma.Decimal;
        direction: string;
        note: string | null;
        accountId: string | null;
      }>
    >(Prisma.sql`
      SELECT
        s."id",s."settlementDate",s."partnerId"::text AS "partnerId",p."name" AS "partnerName",s."currencyCode",s."amount",s."direction",s."note",
        s."accountId"::text AS "accountId"
      FROM "MspSettlement" s
      LEFT JOIN "MspHawalaPartner" p ON p."tenantId"=s."tenantId" AND p."id"=s."partnerId"
      WHERE s."tenantId"=${tenantId}
        ${from ? Prisma.sql`AND s."settlementDate" >= ${from}::date` : Prisma.empty}
        ${to ? Prisma.sql`AND s."settlementDate" <= ${to}::date` : Prisma.empty}
      ORDER BY s."settlementDate" ASC
    `);

    for (const s of settlementRows) {
      stats.settlements.scanned += 1;
      const existsRow = (await this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "total" FROM "MspLedgerEntry"
        WHERE "tenantId"=${tenantId} AND "source"='settlement' AND "ref"=${s.id}
      `))[0];
      if (Number(existsRow?.total ?? 0) > 0) {
        stats.settlements.skippedExisting += 1;
        continue;
      }
      if (!s.accountId) {
        stats.settlements.skippedMissingAccounts += 1;
        continue;
      }

      if (!dryRun) {
        await this.prisma.$transaction(async (tx) => {
          const entryDate = s.settlementDate.toISOString().slice(0, 10);
          const amount = new Prisma.Decimal(s.amount);
          const signed = s.direction === "in" ? amount : amount.mul(-1);
          await this.insertLedgerEntry(tx, { tenantId, accountId: s.accountId!, entryDate, source: "settlement", ref: s.id, amountSigned: signed, note: s.note, userId: req.user.id });
          const partnerAccountId = await this.getOrCreatePartnerAccount(tx, {
            tenantId,
            partnerId: s.partnerId,
            partnerName: s.partnerName ?? "Partner",
            currencyCode: s.currencyCode,
            userId: req.user.id
          });
          await this.insertLedgerEntry(tx, { tenantId, accountId: partnerAccountId, entryDate, source: "settlement", ref: s.id, amountSigned: signed, note: s.note, userId: req.user.id });
        });
      }
      stats.settlements.backfilled += 1;
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: req.user.id,
        action: "msp.maintenance.backfill_ledger",
        entityType: "mspMaintenance",
        entityId: "backfill-ledger",
        metadataJson: { from, to, dryRun, stats } as Prisma.InputJsonValue
      }
    });

    return { data: { dryRun, from, to, stats } };
  }

  @Post("maintenance/backfill-fx-wac")
  @RequirePermissions("msp.exchange.manage")
  async backfillFxWac(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: BackfillMspFxWacDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const from = body.from?.trim() ? this.parseIsoDateOnly(body.from, false) : null;
    const to = body.to?.trim() ? this.parseIsoDateOnly(body.to, false) : null;
    const dryRun = body.dryRun === true;

    const ticketRows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        ticketNumber: number;
        type: string;
        baseCode: string;
        quoteCode: string;
        effectiveDate: Date;
        quoteAmount: Prisma.Decimal;
        baseAmount: Prisma.Decimal;
        feeBase: Prisma.Decimal;
        createdAt: Date;
      }>
    >(Prisma.sql`
      SELECT
        t."id",
        t."ticketNumber",
        t."type",
        t."baseCode",
        t."quoteCode",
        t."effectiveDate",
        t."quoteAmount",
        t."baseAmount",
        t."feeBase",
        t."createdAt"
      FROM "MspExchangeTicket" t
      WHERE t."tenantId"=${tenantId}
        ${from ? Prisma.sql`AND t."effectiveDate" >= ${from}::date` : Prisma.empty}
        ${to ? Prisma.sql`AND t."effectiveDate" <= ${to}::date` : Prisma.empty}
      ORDER BY t."effectiveDate" ASC, t."createdAt" ASC, t."ticketNumber" ASC
    `);

    const stats = { scanned: 0, applied: 0, skipped: 0, realizedProfitTotals: {} as Record<string, string> };

    if (dryRun) {
      const pos = new Map<string, { qty: Prisma.Decimal; totalCost: Prisma.Decimal }>();
      const totals = new Map<string, Prisma.Decimal>();
      for (const t of ticketRows) {
        stats.scanned += 1;
        const type = t.type === "buy" || t.type === "sell" ? (t.type as "buy" | "sell") : null;
        if (!type) {
          stats.skipped += 1;
          continue;
        }
        const key = `${t.quoteCode}__${t.baseCode}`;
        const existing = pos.get(key) ?? { qty: new Prisma.Decimal(0), totalCost: new Prisma.Decimal(0) };
        if (type === "buy") {
          const cost = new Prisma.Decimal(t.baseAmount).add(new Prisma.Decimal(t.feeBase));
          existing.qty = existing.qty.add(new Prisma.Decimal(t.quoteAmount));
          existing.totalCost = existing.totalCost.add(cost);
          pos.set(key, existing);
        } else {
          const qty = existing.qty;
          const totalCost = existing.totalCost;
          const avgCost = qty.gt(0) ? totalCost.div(qty) : new Prisma.Decimal(0);
          const costOfSold = avgCost.mul(new Prisma.Decimal(t.quoteAmount));
          const proceeds = new Prisma.Decimal(t.baseAmount).add(new Prisma.Decimal(t.feeBase));
          const profit = proceeds.sub(costOfSold);
          existing.qty = qty.sub(new Prisma.Decimal(t.quoteAmount));
          existing.totalCost = totalCost.sub(costOfSold);
          pos.set(key, existing);
          const cur = totals.get(t.baseCode) ?? new Prisma.Decimal(0);
          totals.set(t.baseCode, cur.add(profit));
        }
        stats.applied += 1;
      }
      for (const [k, v] of totals.entries()) {
        stats.realizedProfitTotals[k] = v.toString();
      }
    } else {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`DELETE FROM "MspFxPosition" WHERE "tenantId"=${tenantId}`;
        await tx.$queryRaw`
          UPDATE "MspExchangeTicket"
          SET "valuationCurrencyCode"=NULL, "realizedProfitValuation"=NULL, "costOfSoldValuation"=NULL
          WHERE "tenantId"=${tenantId}
            ${from ? Prisma.sql`AND "effectiveDate" >= ${from}::date` : Prisma.empty}
            ${to ? Prisma.sql`AND "effectiveDate" <= ${to}::date` : Prisma.empty}
        `;

        for (const t of ticketRows) {
          stats.scanned += 1;
          const type = t.type === "buy" || t.type === "sell" ? (t.type as "buy" | "sell") : null;
          if (!type) {
            stats.skipped += 1;
            continue;
          }
          await this.applyFxWacFromExchangeTicket(tx, {
            tenantId,
            ticketId: t.id,
            type,
            baseCode: t.baseCode,
            quoteCode: t.quoteCode,
            quoteAmount: new Prisma.Decimal(t.quoteAmount),
            baseAmount: new Prisma.Decimal(t.baseAmount),
            feeBase: new Prisma.Decimal(t.feeBase)
          });
          stats.applied += 1;
        }
      });
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: req.user.id,
        action: "msp.maintenance.backfill_fx_wac",
        entityType: "mspMaintenance",
        entityId: "backfill-fx-wac",
        metadataJson: { from, to, dryRun, scanned: stats.scanned, applied: stats.applied, skipped: stats.skipped } as Prisma.InputJsonValue
      }
    });

    return { data: { dryRun, from, to, stats } };
  }

  @Get("cash/summary")
  @RequirePermissions("msp.cash.view")
  async cashSummary(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const rows = await this.prisma.$queryRaw<
      Array<{ currencyCode: string; cashIn: Prisma.Decimal; cashOut: Prisma.Decimal }>
    >(Prisma.sql`
      SELECT
        "currencyCode",
        COALESCE(SUM(CASE WHEN "direction"='in' THEN "amount" ELSE 0 END),0)::decimal(20,6) AS "cashIn",
        COALESCE(SUM(CASE WHEN "direction"='out' THEN "amount" ELSE 0 END),0)::decimal(20,6) AS "cashOut"
      FROM "MspCashMovement"
      WHERE "tenantId"=${tenantId}
      GROUP BY "currencyCode"
      ORDER BY "currencyCode" ASC
    `);

    return {
      data: {
        balances: rows.map((r) => ({
          currencyCode: r.currencyCode,
          cashIn: r.cashIn.toString(),
          cashOut: r.cashOut.toString(),
          balance: r.cashIn.sub(r.cashOut).toString()
        }))
      }
    };
  }

  @Get("cash/movements")
  @RequirePermissions("msp.cash.view")
  async listCashMovements(@Req() req: { tenantId: string }, @Query() query: ListMspCashMovementsQueryDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const from = this.parseIsoDateOnlyOrNull(query.from);
    const to = this.parseIsoDateOnlyOrNull(query.to);
    const currencyCode = query.currencyCode?.trim() ? query.currencyCode.trim().toUpperCase() : null;
    const direction = query.direction && query.direction !== "all" ? query.direction : null;

    const whereParts: Prisma.Sql[] = [Prisma.sql`m."tenantId"=${tenantId}`];
    if (from && to) whereParts.push(Prisma.sql`m."movementDate" BETWEEN ${from}::date AND ${to}::date`);
    else if (from) whereParts.push(Prisma.sql`m."movementDate" >= ${from}::date`);
    else if (to) whereParts.push(Prisma.sql`m."movementDate" <= ${to}::date`);
    if (currencyCode) whereParts.push(Prisma.sql`m."currencyCode"=${currencyCode}`);
    if (direction) whereParts.push(Prisma.sql`m."direction"=${direction}`);

    const whereSql = Prisma.join(whereParts, " AND ");
    const offset = (page - 1) * pageSize;

    const [rows, countRow] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ id: string; direction: string; movementDate: Date; currencyCode: string; amount: Prisma.Decimal; branchId: string | null; note: string | null; createdAt: Date }>
      >(Prisma.sql`
        SELECT m."id",m."direction",m."movementDate",m."currencyCode",m."amount",m."branchId",m."note",m."createdAt"
        FROM "MspCashMovement" m
        WHERE ${whereSql}
        ORDER BY m."movementDate" DESC, m."createdAt" DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "total" FROM "MspCashMovement" m WHERE ${whereSql}
      `)
    ]);

    return {
      data: {
        page,
        pageSize,
        total: Number(countRow?.[0]?.total ?? 0),
        items: rows.map((r) => ({
          id: r.id,
          direction: r.direction,
          movementDate: r.movementDate.toISOString().slice(0, 10),
          currencyCode: r.currencyCode,
          amount: r.amount.toString(),
          branchId: r.branchId,
          note: r.note,
          createdAt: r.createdAt.toISOString()
        }))
      }
    };
  }

  @Post("cash/movements")
  @RequirePermissions("msp.cash.manage")
  async createCashMovement(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: CreateMspCashMovementDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const direction = body.direction;
    const currencyCode = body.currencyCode.trim().toUpperCase();
    await this.assertActiveCurrency(tenantId, currencyCode);

    const movementDate = body.movementDate?.trim() ? this.parseIsoDateOnly(body.movementDate, false) : this.parseIsoDateOnly(undefined, true);
    const amount = this.normalizeMoneyInput(body.amount);
    const note = body.note?.trim() ? body.note.trim() : null;
    const branchId = body.branchId?.trim() ? body.branchId.trim() : null;

    if (branchId) {
      const branch = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "MspBranch" WHERE "tenantId"=${tenantId} AND "id"=${branchId} LIMIT 1
      `;
      if (branch.length === 0) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const created = (await this.prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "MspCashMovement" ("tenantId","direction","movementDate","currencyCode","amount","branchId","note","createdAt","createdByUserId")
      VALUES (${tenantId}, ${direction}, ${movementDate}::date, ${currencyCode}, ${amount}, ${branchId}::uuid, ${note}, NOW(), ${req.user.id})
      RETURNING "id"
    `)[0];
    if (!created?.id) throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);

    await this.prisma.auditLog.create({
      data: { tenantId, actorUserId: req.user.id, action: "msp.cash.movement.create", entityType: "mspCashMovement", entityId: created.id, metadataJson: { direction, currencyCode, amount: amount.toString(), movementDate, branchId, note } }
    });

    return { data: { id: created.id } };
  }

  @Get("settlements")
  @RequirePermissions("msp.settlements.view")
  async listSettlements(@Req() req: { tenantId: string }, @Query() query: ListMspSettlementsQueryDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const from = this.parseIsoDateOnlyOrNull(query.from);
    const to = this.parseIsoDateOnlyOrNull(query.to);
    const partnerId = query.partnerId?.trim() ? query.partnerId.trim() : null;
    const currencyCode = query.currencyCode?.trim() ? query.currencyCode.trim().toUpperCase() : null;

    const whereParts: Prisma.Sql[] = [Prisma.sql`s."tenantId"=${tenantId}`];
    if (from && to) whereParts.push(Prisma.sql`s."settlementDate" BETWEEN ${from}::date AND ${to}::date`);
    else if (from) whereParts.push(Prisma.sql`s."settlementDate" >= ${from}::date`);
    else if (to) whereParts.push(Prisma.sql`s."settlementDate" <= ${to}::date`);
    if (partnerId) whereParts.push(Prisma.sql`s."partnerId"=${partnerId}::uuid`);
    if (currencyCode) whereParts.push(Prisma.sql`s."currencyCode"=${currencyCode}`);

    const whereSql = Prisma.join(whereParts, " AND ");
    const offset = (page - 1) * pageSize;

    const [rows, countRow] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ id: string; settlementDate: Date; partnerId: string; partnerName: string | null; direction: string; currencyCode: string; amount: Prisma.Decimal; note: string | null; createdAt: Date }>
      >(Prisma.sql`
        SELECT s."id",s."settlementDate",s."partnerId",p."name" AS "partnerName",s."direction",s."currencyCode",s."amount",s."note",s."createdAt"
        FROM "MspSettlement" s
        LEFT JOIN "MspHawalaPartner" p ON p."id" = s."partnerId" AND p."tenantId" = s."tenantId"
        WHERE ${whereSql}
        ORDER BY s."settlementDate" DESC, s."createdAt" DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "total" FROM "MspSettlement" s WHERE ${whereSql}
      `)
    ]);

    return {
      data: {
        page,
        pageSize,
        total: Number(countRow?.[0]?.total ?? 0),
        items: rows.map((r) => ({
          id: r.id,
          settlementDate: r.settlementDate.toISOString().slice(0, 10),
          partnerId: r.partnerId,
          partnerName: r.partnerName,
          direction: r.direction,
          currencyCode: r.currencyCode,
          amount: r.amount.toString(),
          note: r.note,
          createdAt: r.createdAt.toISOString()
        }))
      }
    };
  }

  @Post("settlements")
  @RequirePermissions("msp.settlements.manage")
  async createSettlement(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: CreateMspSettlementDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const partnerId = body.partnerId.trim();
    const partner = await this.prisma.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT "id","name" FROM "MspHawalaPartner" WHERE "tenantId"=${tenantId} AND "id"=${partnerId} LIMIT 1
    `;
    if (partner.length === 0) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    const partnerName = partner[0]?.name ?? "Partner";

    const direction = body.direction;
    const currencyCode = body.currencyCode.trim().toUpperCase();
    await this.assertActiveCurrency(tenantId, currencyCode);
    const accountId = body.accountId.trim();
    if (!accountId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    await this.assertActiveCashBankAccount(tenantId, accountId, currencyCode);

    const settlementDate = body.settlementDate?.trim() ? this.parseIsoDateOnly(body.settlementDate, false) : this.parseIsoDateOnly(undefined, true);
    const amount = this.normalizeMoneyInput(body.amount);
    const note = body.note?.trim() ? body.note.trim() : null;

    const created = await this.prisma.$transaction(async (tx) => {
      if (direction === "out") {
        await this.assertSufficientBalance(tx, tenantId, accountId, amount);
      }

      const row = (await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "MspSettlement" ("tenantId","partnerId","direction","settlementDate","currencyCode","amount","note","accountId","createdAt","createdByUserId")
        VALUES (${tenantId}, ${partnerId}::uuid, ${direction}, ${settlementDate}::date, ${currencyCode}, ${amount}, ${note}, ${accountId}::uuid, NOW(), ${req.user.id})
        RETURNING "id"
      `)[0];
      if (!row?.id) throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);

      const signed = direction === "in" ? amount : amount.mul(-1);
      await this.insertLedgerEntry(tx, { tenantId, accountId, entryDate: settlementDate, source: "settlement", ref: row.id, amountSigned: signed, note, userId: req.user.id });
      const partnerAccountId = await this.getOrCreatePartnerAccount(tx, { tenantId, partnerId, partnerName, currencyCode, userId: req.user.id });
      await this.insertLedgerEntry(tx, {
        tenantId,
        accountId: partnerAccountId,
        entryDate: settlementDate,
        source: "settlement",
        ref: row.id,
        amountSigned: signed,
        note,
        userId: req.user.id
      });
      return row;
    });
    if (!created?.id) throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);

    await this.prisma.auditLog.create({
      data: { tenantId, actorUserId: req.user.id, action: "msp.settlement.create", entityType: "mspSettlement", entityId: created.id, metadataJson: { partnerId, direction, currencyCode, amount: amount.toString(), settlementDate, accountId, note } }
    });

    return { data: { id: created.id } };
  }

  @Get("reports/summary")
  @RequirePermissions("msp.reports.view")
  async reportsSummary(@Req() req: { tenantId: string }, @Query() query: MspReportsRangeQueryDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const today = new Date();
    const toDefault = today.toISOString().slice(0, 10);
    const fromDefaultDate = new Date(today);
    fromDefaultDate.setDate(fromDefaultDate.getDate() - 6);
    const fromDefault = fromDefaultDate.toISOString().slice(0, 10);

    const from = query.from?.trim() ? this.parseIsoDateOnly(query.from, false) : fromDefault;
    const to = query.to?.trim() ? this.parseIsoDateOnly(query.to, false) : toDefault;

    const [exchangeByType, hawalaByStatus, cashByCurrency, settlementsByCurrency] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ type: string; tickets: bigint; baseAmount: Prisma.Decimal; feeBase: Prisma.Decimal; quoteAmount: Prisma.Decimal }>
      >(Prisma.sql`
        SELECT
          "type",
          COUNT(*)::bigint AS "tickets",
          COALESCE(SUM("baseAmount"),0)::decimal(20,6) AS "baseAmount",
          COALESCE(SUM("feeBase"),0)::decimal(20,6) AS "feeBase",
          COALESCE(SUM("quoteAmount"),0)::decimal(20,6) AS "quoteAmount"
        FROM "MspExchangeTicket"
        WHERE "tenantId"=${tenantId} AND "effectiveDate" BETWEEN ${from}::date AND ${to}::date
        GROUP BY "type"
        ORDER BY "type" ASC
      `),
      this.prisma.$queryRaw<
        Array<{ status: string; transfers: bigint; amount: Prisma.Decimal; fee: Prisma.Decimal; total: Prisma.Decimal }>
      >(Prisma.sql`
        SELECT
          "status",
          COUNT(*)::bigint AS "transfers",
          COALESCE(SUM("amount"),0)::decimal(20,6) AS "amount",
          COALESCE(SUM("fee"),0)::decimal(20,6) AS "fee",
          COALESCE(SUM("total"),0)::decimal(20,6) AS "total"
        FROM "MspHawalaTransfer"
        WHERE "tenantId"=${tenantId} AND "transferDate" BETWEEN ${from}::date AND ${to}::date
        GROUP BY "status"
        ORDER BY "status" ASC
      `),
      this.prisma.$queryRaw<
        Array<{ currencyCode: string; cashIn: Prisma.Decimal; cashOut: Prisma.Decimal }>
      >(Prisma.sql`
        SELECT
          a."currencyCode",
          COALESCE(SUM(CASE WHEN e."amountSigned" > 0 THEN e."amountSigned" ELSE 0 END),0)::decimal(20,6) AS "cashIn",
          COALESCE(SUM(CASE WHEN e."amountSigned" < 0 THEN -e."amountSigned" ELSE 0 END),0)::decimal(20,6) AS "cashOut"
        FROM "MspLedgerEntry" e
        JOIN "MspAccount" a ON a."tenantId"=e."tenantId" AND a."id"=e."accountId"
        WHERE e."tenantId"=${tenantId}
          AND e."entryDate" BETWEEN ${from}::date AND ${to}::date
          AND a."type"='cash'
        GROUP BY a."currencyCode"
        ORDER BY a."currencyCode" ASC
      `),
      this.prisma.$queryRaw<
        Array<{ currencyCode: string; direction: string; count: bigint; amount: Prisma.Decimal }>
      >(Prisma.sql`
        SELECT
          "currencyCode",
          "direction",
          COUNT(*)::bigint AS "count",
          COALESCE(SUM("amount"),0)::decimal(20,6) AS "amount"
        FROM "MspSettlement"
        WHERE "tenantId"=${tenantId} AND "settlementDate" BETWEEN ${from}::date AND ${to}::date
        GROUP BY "currencyCode","direction"
        ORDER BY "currencyCode" ASC, "direction" ASC
      `)
    ]);

    return {
      data: {
        from,
        to,
        exchange: exchangeByType.map((r) => ({
          type: r.type,
          tickets: Number(r.tickets),
          quoteAmount: r.quoteAmount.toString(),
          baseAmount: r.baseAmount.toString(),
          feeBase: r.feeBase.toString(),
          totalBase: r.baseAmount.add(r.feeBase).toString()
        })),
        hawala: hawalaByStatus.map((r) => ({
          status: r.status,
          transfers: Number(r.transfers),
          amount: r.amount.toString(),
          fee: r.fee.toString(),
          total: r.total.toString()
        })),
        cash: cashByCurrency.map((r) => ({
          currencyCode: r.currencyCode,
          cashIn: r.cashIn.toString(),
          cashOut: r.cashOut.toString(),
          balance: r.cashIn.sub(r.cashOut).toString()
        })),
        settlements: settlementsByCurrency.map((r) => ({
          currencyCode: r.currencyCode,
          direction: r.direction,
          count: Number(r.count),
          amount: r.amount.toString()
        }))
      }
    };
  }

  @Get("aml/alerts")
  @RequirePermissions("msp.reports.view")
  async listAmlAlerts(@Req() req: { tenantId: string }, @Query() query: ListMspAmlAlertsQueryDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const today = new Date();
    const toDefault = today.toISOString().slice(0, 10);
    const fromDefaultDate = new Date(today);
    fromDefaultDate.setDate(fromDefaultDate.getDate() - 6);
    const fromDefault = fromDefaultDate.toISOString().slice(0, 10);

    const from = query.from?.trim() ? this.parseIsoDateOnly(query.from, false) : fromDefault;
    const to = query.to?.trim() ? this.parseIsoDateOnly(query.to, false) : toDefault;
    const status = query.status ?? "open";
    const q = query.q?.trim() ? query.q.trim().toLowerCase() : null;
    const customerId = query.customerId?.trim() ? query.customerId.trim() : null;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const offset = (page - 1) * pageSize;

    const whereParts: Prisma.Sql[] = [
      Prisma.sql`a."tenantId"=${tenantId}`,
      Prisma.sql`a."createdAt"::date BETWEEN ${from}::date AND ${to}::date`
    ];
    if (status !== "all") whereParts.push(Prisma.sql`a."status"=${status}`);
    if (customerId) whereParts.push(Prisma.sql`a."customerId"=${customerId}::uuid`);
    if (q) {
      whereParts.push(
        Prisma.sql`(LOWER(a."title") LIKE ${"%" + q + "%"} OR LOWER(a."ruleCode") LIKE ${"%" + q + "%"} OR LOWER(COALESCE(c."name",'')) LIKE ${"%" + q + "%"} OR LOWER(COALESCE(c."phone",'')) LIKE ${"%" + q + "%"})`
      );
    }
    const whereSql = Prisma.join(whereParts, " AND ");

    const [rows, countRow] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          id: string;
          createdAt: Date;
          status: string;
          ruleCode: string;
          severity: string;
          title: string;
          sourceType: string;
          sourceId: string | null;
          customerId: string | null;
          customerName: string | null;
          customerPhone: string | null;
          currencyCode: string | null;
          amount: Prisma.Decimal | null;
          closedAt: Date | null;
          closeNote: string | null;
        }>
      >(Prisma.sql`
        SELECT
          a."id",
          a."createdAt",
          a."status",
          a."ruleCode",
          a."severity",
          a."title",
          a."sourceType",
          a."sourceId"::text AS "sourceId",
          a."customerId"::text AS "customerId",
          c."name" AS "customerName",
          c."phone" AS "customerPhone",
          a."currencyCode",
          a."amount",
          a."closedAt",
          a."closeNote"
        FROM "MspAmlAlert" a
        LEFT JOIN "MspCustomer" c ON c."tenantId"=a."tenantId" AND c."id"=a."customerId"
        WHERE ${whereSql}
        ORDER BY a."createdAt" DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "total"
        FROM "MspAmlAlert" a
        LEFT JOIN "MspCustomer" c ON c."tenantId"=a."tenantId" AND c."id"=a."customerId"
        WHERE ${whereSql}
      `)
    ]);

    return {
      data: {
        page,
        pageSize,
        total: Number(countRow?.[0]?.total ?? 0),
        items: rows.map((r) => ({
          id: r.id,
          createdAt: r.createdAt.toISOString(),
          status: r.status,
          ruleCode: r.ruleCode,
          severity: r.severity,
          title: r.title,
          sourceType: r.sourceType,
          sourceId: r.sourceId,
          customerId: r.customerId,
          customerName: r.customerName,
          customerPhone: r.customerPhone,
          currencyCode: r.currencyCode,
          amount: r.amount ? r.amount.toString() : null,
          closedAt: r.closedAt ? r.closedAt.toISOString() : null,
          closeNote: r.closeNote
        }))
      }
    };
  }

  @Post("aml/alerts/:id/close")
  @RequirePermissions("msp.reports.view")
  async closeAmlAlert(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: CloseMspAmlAlertDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const note = body.note?.trim() ? body.note.trim() : null;
    const row = (
      await this.prisma.$queryRaw<Array<{ id: string }>>`
        UPDATE "MspAmlAlert"
        SET "status"='closed',"closedAt"=NOW(),"closedByUserId"=${req.user.id},"closeNote"=${note}
        WHERE "tenantId"=${tenantId} AND "id"=${id}::uuid AND "status"='open'
        RETURNING "id"
      `
    )[0];
    if (!row?.id) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: req.user.id,
        action: "msp.aml.alert.close",
        entityType: "mspAmlAlert",
        entityId: id,
        metadataJson: { note } as Prisma.InputJsonValue
      }
    });

    return { data: { success: true } };
  }

  @Get("fx/positions")
  @RequirePermissions("msp.reports.view")
  async fxPositions(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const rows = await this.prisma.$queryRaw<
      Array<{
        currencyCode: string;
        cash: Prisma.Decimal;
        bank: Prisma.Decimal;
        customer: Prisma.Decimal;
        partner: Prisma.Decimal;
        system: Prisma.Decimal;
      }>
    >(Prisma.sql`
      SELECT
        c."code" AS "currencyCode",
        COALESCE(SUM(CASE WHEN a."type"='cash' THEN e."amountSigned" ELSE 0 END),0)::decimal(20,6) AS "cash",
        COALESCE(SUM(CASE WHEN a."type"='bank' THEN e."amountSigned" ELSE 0 END),0)::decimal(20,6) AS "bank",
        COALESCE(SUM(CASE WHEN a."type"='customer' THEN e."amountSigned" ELSE 0 END),0)::decimal(20,6) AS "customer",
        COALESCE(SUM(CASE WHEN a."type"='partner' THEN e."amountSigned" ELSE 0 END),0)::decimal(20,6) AS "partner",
        COALESCE(SUM(CASE WHEN a."type"='system' THEN e."amountSigned" ELSE 0 END),0)::decimal(20,6) AS "system"
      FROM "MspCurrency" c
      LEFT JOIN "MspAccount" a ON a."tenantId"=c."tenantId" AND a."currencyCode"=c."code"
      LEFT JOIN "MspLedgerEntry" e ON e."tenantId"=a."tenantId" AND e."accountId"=a."id"
      WHERE c."tenantId"=${tenantId} AND c."isActive"=TRUE
      GROUP BY c."code"
      ORDER BY c."code" ASC
    `);

    return {
      data: {
        items: rows.map((r) => {
          const cashBank = r.cash.add(r.bank);
          const netOwned = cashBank.sub(r.customer).sub(r.partner);
          return {
            currencyCode: r.currencyCode,
            cash: r.cash.toString(),
            bank: r.bank.toString(),
            cashBank: cashBank.toString(),
            customer: r.customer.toString(),
            partner: r.partner.toString(),
            system: r.system.toString(),
            netOwned: netOwned.toString()
          };
        })
      }
    };
  }

  @Get("fx/profit")
  @RequirePermissions("msp.reports.view")
  async fxProfit(@Req() req: { tenantId: string }, @Query() query: GetMspFxProfitQueryDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const today = new Date();
    const toDefault = today.toISOString().slice(0, 10);
    const fromDefaultDate = new Date(today);
    fromDefaultDate.setDate(fromDefaultDate.getDate() - 6);
    const fromDefault = fromDefaultDate.toISOString().slice(0, 10);

    const from = query.from?.trim() ? this.parseIsoDateOnly(query.from, false) : fromDefault;
    const to = query.to?.trim() ? this.parseIsoDateOnly(query.to, false) : toDefault;

    const rows = await this.prisma.$queryRaw<
      Array<{
        baseCode: string;
        quoteCode: string;
        type: string;
        tickets: bigint;
        ticketsWithRate: bigint;
        quoteAmount: Prisma.Decimal;
        baseAmount: Prisma.Decimal;
        feeBase: Prisma.Decimal;
        spreadBaseEstimated: Prisma.Decimal;
      }>
    >(Prisma.sql`
      SELECT
        t."baseCode" AS "baseCode",
        t."quoteCode" AS "quoteCode",
        t."type" AS "type",
        COUNT(*)::bigint AS "tickets",
        COALESCE(SUM(CASE WHEN r."id" IS NULL THEN 0 ELSE 1 END),0)::bigint AS "ticketsWithRate",
        COALESCE(SUM(t."quoteAmount"),0)::decimal(20,6) AS "quoteAmount",
        COALESCE(SUM(t."baseAmount"),0)::decimal(20,6) AS "baseAmount",
        COALESCE(SUM(t."feeBase"),0)::decimal(20,6) AS "feeBase",
        COALESCE(SUM(
          CASE
            WHEN r."id" IS NULL THEN 0
            WHEN t."type"='buy' THEN (r."buyRate" - t."rate") * t."quoteAmount"
            ELSE (t."rate" - r."sellRate") * t."quoteAmount"
          END
        ),0)::decimal(20,6) AS "spreadBaseEstimated"
      FROM "MspExchangeTicket" t
      LEFT JOIN "MspExchangeRate" r
        ON r."tenantId"=t."tenantId"
        AND r."baseCode"=t."baseCode"
        AND r."quoteCode"=t."quoteCode"
        AND r."effectiveDate"=t."effectiveDate"
      WHERE t."tenantId"=${tenantId} AND t."effectiveDate" BETWEEN ${from}::date AND ${to}::date
      GROUP BY t."baseCode", t."quoteCode", t."type"
      ORDER BY t."baseCode" ASC, t."quoteCode" ASC, t."type" ASC
    `);

    const totalsByBase = new Map<
      string,
      { baseCode: string; tickets: number; ticketsWithRate: number; feeBase: Prisma.Decimal; spreadBaseEstimated: Prisma.Decimal; profitEstimated: Prisma.Decimal }
    >();
    for (const r of rows) {
      const profitEstimated = r.spreadBaseEstimated.add(r.feeBase);
      const existing = totalsByBase.get(r.baseCode);
      if (!existing) {
        totalsByBase.set(r.baseCode, {
          baseCode: r.baseCode,
          tickets: Number(r.tickets),
          ticketsWithRate: Number(r.ticketsWithRate),
          feeBase: r.feeBase,
          spreadBaseEstimated: r.spreadBaseEstimated,
          profitEstimated
        });
      } else {
        existing.tickets += Number(r.tickets);
        existing.ticketsWithRate += Number(r.ticketsWithRate);
        existing.feeBase = existing.feeBase.add(r.feeBase);
        existing.spreadBaseEstimated = existing.spreadBaseEstimated.add(r.spreadBaseEstimated);
        existing.profitEstimated = existing.profitEstimated.add(profitEstimated);
      }
    }

    return {
      data: {
        from,
        to,
        totalsByBase: Array.from(totalsByBase.values()).map((t) => ({
          baseCode: t.baseCode,
          tickets: t.tickets,
          ticketsWithRate: t.ticketsWithRate,
          feeBase: t.feeBase.toString(),
          spreadBaseEstimated: t.spreadBaseEstimated.toString(),
          profitEstimated: t.profitEstimated.toString()
        })),
        items: rows.map((r) => {
          const profitEstimated = r.spreadBaseEstimated.add(r.feeBase);
          return {
            baseCode: r.baseCode,
            quoteCode: r.quoteCode,
            type: r.type,
            tickets: Number(r.tickets),
            ticketsWithRate: Number(r.ticketsWithRate),
            quoteAmount: r.quoteAmount.toString(),
            baseAmount: r.baseAmount.toString(),
            feeBase: r.feeBase.toString(),
            totalBase: r.baseAmount.add(r.feeBase).toString(),
            spreadBaseEstimated: r.spreadBaseEstimated.toString(),
            profitEstimated: profitEstimated.toString()
          };
        })
      }
    };
  }

  @Get("fx/pnl/realized")
  @RequirePermissions("msp.reports.view")
  async fxRealizedPnl(@Req() req: { tenantId: string }, @Query() query: GetMspFxProfitQueryDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const today = new Date();
    const toDefault = today.toISOString().slice(0, 10);
    const fromDefaultDate = new Date(today);
    fromDefaultDate.setDate(fromDefaultDate.getDate() - 6);
    const fromDefault = fromDefaultDate.toISOString().slice(0, 10);

    const from = query.from?.trim() ? this.parseIsoDateOnly(query.from, false) : fromDefault;
    const to = query.to?.trim() ? this.parseIsoDateOnly(query.to, false) : toDefault;

    const rows = await this.prisma.$queryRaw<
      Array<{
        valuationCurrencyCode: string;
        quoteCode: string;
        tickets: bigint;
        quoteAmount: Prisma.Decimal;
        baseAmount: Prisma.Decimal;
        feeBase: Prisma.Decimal;
        costOfSoldValuation: Prisma.Decimal;
        realizedProfitValuation: Prisma.Decimal;
      }>
    >(Prisma.sql`
      SELECT
        COALESCE(t."valuationCurrencyCode", t."baseCode") AS "valuationCurrencyCode",
        t."quoteCode" AS "quoteCode",
        COUNT(*)::bigint AS "tickets",
        COALESCE(SUM(t."quoteAmount"),0)::decimal(20,6) AS "quoteAmount",
        COALESCE(SUM(t."baseAmount"),0)::decimal(20,6) AS "baseAmount",
        COALESCE(SUM(t."feeBase"),0)::decimal(20,6) AS "feeBase",
        COALESCE(SUM(COALESCE(t."costOfSoldValuation",0)),0)::decimal(20,6) AS "costOfSoldValuation",
        COALESCE(SUM(COALESCE(t."realizedProfitValuation",0)),0)::decimal(20,6) AS "realizedProfitValuation"
      FROM "MspExchangeTicket" t
      WHERE t."tenantId"=${tenantId}
        AND t."effectiveDate" BETWEEN ${from}::date AND ${to}::date
        AND t."type"='sell'
        AND t."valuationCurrencyCode" IS NOT NULL
      GROUP BY COALESCE(t."valuationCurrencyCode", t."baseCode"), t."quoteCode"
      ORDER BY COALESCE(t."valuationCurrencyCode", t."baseCode") ASC, t."quoteCode" ASC
    `);

    const totalsByValuation = new Map<
      string,
      { valuationCurrencyCode: string; tickets: number; fee: Prisma.Decimal; costOfSold: Prisma.Decimal; profit: Prisma.Decimal }
    >();
    for (const r of rows) {
      const existing = totalsByValuation.get(r.valuationCurrencyCode);
      if (!existing) {
        totalsByValuation.set(r.valuationCurrencyCode, {
          valuationCurrencyCode: r.valuationCurrencyCode,
          tickets: Number(r.tickets),
          fee: r.feeBase,
          costOfSold: r.costOfSoldValuation,
          profit: r.realizedProfitValuation
        });
      } else {
        existing.tickets += Number(r.tickets);
        existing.fee = existing.fee.add(r.feeBase);
        existing.costOfSold = existing.costOfSold.add(r.costOfSoldValuation);
        existing.profit = existing.profit.add(r.realizedProfitValuation);
      }
    }

    return {
      data: {
        from,
        to,
        totalsByValuation: Array.from(totalsByValuation.values()).map((t) => ({
          valuationCurrencyCode: t.valuationCurrencyCode,
          tickets: t.tickets,
          fee: t.fee.toString(),
          costOfSold: t.costOfSold.toString(),
          profit: t.profit.toString()
        })),
        items: rows.map((r) => ({
          valuationCurrencyCode: r.valuationCurrencyCode,
          quoteCode: r.quoteCode,
          tickets: Number(r.tickets),
          quoteAmount: r.quoteAmount.toString(),
          baseAmount: r.baseAmount.toString(),
          fee: r.feeBase.toString(),
          proceeds: r.baseAmount.add(r.feeBase).toString(),
          costOfSold: r.costOfSoldValuation.toString(),
          profit: r.realizedProfitValuation.toString()
        }))
      }
    };
  }

  @Get("fx/pnl/unrealized")
  @RequirePermissions("msp.reports.view")
  async fxUnrealizedPnl(@Req() req: { tenantId: string }, @Query() query: GetMspFxProfitQueryDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const asOfDate = query.to?.trim() ? this.parseIsoDateOnly(query.to, false) : new Date().toISOString().slice(0, 10);

    const rows = await this.prisma.$queryRaw<
      Array<{
        currencyCode: string;
        valuationCurrencyCode: string;
        qty: Prisma.Decimal;
        totalCostValuation: Prisma.Decimal;
        buyRate: Prisma.Decimal | null;
        sellRate: Prisma.Decimal | null;
        rateDate: Date | null;
      }>
    >(Prisma.sql`
      SELECT
        p."currencyCode" AS "currencyCode",
        p."valuationCurrencyCode" AS "valuationCurrencyCode",
        p."qty" AS "qty",
        p."totalCostValuation" AS "totalCostValuation",
        r."buyRate" AS "buyRate",
        r."sellRate" AS "sellRate",
        r."effectiveDate" AS "rateDate"
      FROM "MspFxPosition" p
      LEFT JOIN LATERAL (
        SELECT "buyRate","sellRate","effectiveDate"
        FROM "MspExchangeRate" r
        WHERE r."tenantId"=p."tenantId"
          AND r."baseCode"=p."valuationCurrencyCode"
          AND r."quoteCode"=p."currencyCode"
          AND r."effectiveDate" <= ${asOfDate}::date
        ORDER BY r."effectiveDate" DESC
        LIMIT 1
      ) r ON TRUE
      WHERE p."tenantId"=${tenantId} AND p."qty" <> 0
      ORDER BY p."valuationCurrencyCode" ASC, p."currencyCode" ASC
    `);

    return {
      data: {
        asOfDate,
        items: rows.map((r) => {
          const avgCost = r.qty.eq(0) ? new Prisma.Decimal(0) : r.totalCostValuation.div(r.qty);
          const rate = r.qty.gte(0) ? r.sellRate : r.buyRate;
          const marketValue = rate ? r.qty.mul(rate) : null;
          const unrealized = marketValue ? marketValue.sub(r.totalCostValuation) : null;
          return {
            currencyCode: r.currencyCode,
            valuationCurrencyCode: r.valuationCurrencyCode,
            qty: r.qty.toString(),
            totalCostValuation: r.totalCostValuation.toString(),
            avgCostValuation: avgCost.toString(),
            buyRate: r.buyRate ? r.buyRate.toString() : null,
            sellRate: r.sellRate ? r.sellRate.toString() : null,
            rateDate: r.rateDate ? r.rateDate.toISOString().slice(0, 10) : null,
            marketRate: rate ? rate.toString() : null,
            marketValue: marketValue ? marketValue.toString() : null,
            unrealized: unrealized ? unrealized.toString() : null
          };
        })
      }
    };
  }

  @Post("reports/export-log")
  @RequirePermissions("msp.reports.export")
  async reportsExportLog(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: MspReportExportLogDto) {
    const tenantId = req.tenantId;
    await this.prisma.auditLog.create({
      data: { tenantId, actorUserId: req.user.id, action: "msp.reports.export", entityType: "mspReport", entityId: "summary", metadataJson: { format: body.format, from: body.from ?? null, to: body.to ?? null } }
    });
    return { data: { success: true } };
  }

  @Get("audit")
  @RequirePermissions("msp.audit.view")
  async listAudit(@Req() req: { tenantId: string }, @Query() query: ListMspAuditQueryDto) {
    const tenantId = req.tenantId;
    const page = this.toInt(query.page, 1);
    const pageSize = Math.min(100, this.toInt(query.pageSize, 20));
    const skip = (page - 1) * pageSize;

    const q = query.q?.trim() || null;
    const action = query.action?.trim() || null;
    const entityType = query.entityType?.trim() || null;
    const actorUserId = query.actorUserId?.trim() || null;
    const from = this.parseDateTimeOrNull(query.from);
    const to = this.parseDateTimeOrNull(query.to);

    const where: Record<string, unknown> = { tenantId, action: { startsWith: "msp." } };
    if (from || to) {
      where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    }
    if (actorUserId) where.actorUserId = actorUserId;
    if (action) where.action = { contains: action, mode: "insensitive" };
    if (entityType) where.entityType = { contains: entityType, mode: "insensitive" };
    if (q) {
      where.OR = [
        { action: { contains: q, mode: "insensitive" } },
        { entityType: { contains: q, mode: "insensitive" } },
        { entityId: { contains: q, mode: "insensitive" } }
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          createdAt: true,
          action: true,
          entityType: true,
          entityId: true,
          metadataJson: true,
          actor: { select: { id: true, fullName: true, email: true } }
        }
      })
    ]);

    return {
      data: {
        page,
        pageSize,
        total,
        items: items.map((it) => ({
          id: it.id,
          createdAt: it.createdAt.toISOString(),
          action: it.action,
          entityType: it.entityType,
          entityId: it.entityId,
          metadata: it.metadataJson,
          actor: it.actor
            ? {
                id: it.actor.id,
                fullName: it.actor.fullName,
                email: it.actor.email
              }
            : null
        }))
      }
    };
  }

  @Post("audit/export-log")
  @RequirePermissions("msp.audit.export")
  async auditExportLog(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: MspAuditExportLogDto) {
    const tenantId = req.tenantId;
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: req.user.id,
        action: "msp.audit.export",
        entityType: "mspAudit",
        entityId: body.format,
        metadataJson: { format: body.format, q: body.q ?? null, action: body.action ?? null, entityType: body.entityType ?? null, from: body.from ?? null, to: body.to ?? null }
      }
    });
    return { data: { success: true } };
  }

  @Get("ledger/events")
  @RequirePermissions("msp.ledger.view")
  async listLedgerEvents(@Req() req: { tenantId: string }, @Query() query: ListMspLedgerEventsQueryDto) {
    const tenantId = req.tenantId;
    await this.ensureMspDefaults(tenantId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const from = this.parseIsoDateOnlyOrNull(query.from);
    const to = this.parseIsoDateOnlyOrNull(query.to);
    const currencyCode = query.currencyCode?.trim() ? query.currencyCode.trim().toUpperCase() : null;

    const whereParts: Prisma.Sql[] = [Prisma.sql`e."tenantId"=${tenantId}`];
    if (from && to) whereParts.push(Prisma.sql`e."entryDate" BETWEEN ${from}::date AND ${to}::date`);
    else if (from) whereParts.push(Prisma.sql`e."entryDate" >= ${from}::date`);
    else if (to) whereParts.push(Prisma.sql`e."entryDate" <= ${to}::date`);
    if (currencyCode) whereParts.push(Prisma.sql`a."currencyCode"=${currencyCode}`);

    const whereSql = Prisma.join(whereParts, " AND ");
    const offset = (page - 1) * pageSize;

    const [rows, countRow] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          source: string;
          eventId: string;
          eventDate: Date;
          occurredAt: Date;
          ref: string | null;
          currencyCode: string;
          amountSigned: Prisma.Decimal;
          note: string | null;
          accountId: string;
          accountType: string;
          accountName: string;
        }>
      >(Prisma.sql`
        SELECT
          e."source" AS "source",
          e."id"::text AS "eventId",
          e."entryDate" AS "eventDate",
          e."occurredAt" AS "occurredAt",
          e."ref" AS "ref",
          a."currencyCode" AS "currencyCode",
          e."amountSigned" AS "amountSigned",
          e."note" AS "note",
          a."id"::text AS "accountId",
          a."type" AS "accountType",
          a."name" AS "accountName"
        FROM "MspLedgerEntry" e
        JOIN "MspAccount" a ON a."tenantId"=e."tenantId" AND a."id"=e."accountId"
        WHERE ${whereSql}
        ORDER BY e."occurredAt" DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "total"
        FROM "MspLedgerEntry" e
        JOIN "MspAccount" a ON a."tenantId"=e."tenantId" AND a."id"=e."accountId"
        WHERE ${whereSql}
      `)
    ]);

    return {
      data: {
        page,
        pageSize,
        total: Number(countRow?.[0]?.total ?? 0),
        items: rows.map((r) => ({
          source: r.source,
          eventId: r.eventId,
          eventDate: r.eventDate.toISOString().slice(0, 10),
          occurredAt: r.occurredAt.toISOString(),
          ref: r.ref,
          currencyCode: r.currencyCode,
          amountSigned: r.amountSigned.toString(),
          note: r.note,
          accountId: r.accountId,
          accountType: r.accountType,
          accountName: r.accountName
        }))
      }
    };
  }
}
