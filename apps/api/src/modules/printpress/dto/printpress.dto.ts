import { PrintPressInvoiceStatus, PrintPressJobPriority, PrintPressJobStatus, PrintPressQuotationStatus } from "@prisma/client";
import { IsIn, IsOptional, IsString, Length } from "class-validator";

export class ListPrintPressCustomersQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(["active", "archived"])
  status?: "active" | "archived";

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class UpsertPrintPressCustomerDto {
  @IsString()
  @Length(2, 160)
  fullName!: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsIn(["individual", "business"])
  customerType?: "individual" | "business";

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  taxNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ListPrintPressJobsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(Object.values(PrintPressJobStatus))
  status?: PrintPressJobStatus;

  @IsOptional()
  @IsIn(Object.values(PrintPressJobPriority))
  priority?: PrintPressJobPriority;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class CreatePrintPressJobDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(Object.values(PrintPressJobStatus))
  status?: PrintPressJobStatus;

  @IsOptional()
  @IsIn(Object.values(PrintPressJobPriority))
  priority?: PrintPressJobPriority;
}

export class UpdatePrintPressJobDto {
  @IsOptional()
  @IsIn(Object.values(PrintPressJobStatus))
  status?: PrintPressJobStatus;

  @IsOptional()
  @IsIn(Object.values(PrintPressJobPriority))
  priority?: PrintPressJobPriority;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class ListPrintPressQuotationsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(Object.values(PrintPressQuotationStatus))
  status?: PrintPressQuotationStatus;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class CreatePrintPressQuotationDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  discount?: string;

  @IsOptional()
  @IsString()
  tax?: string;
}

export class UpdatePrintPressQuotationDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  discount?: string;

  @IsOptional()
  @IsString()
  tax?: string;
}

export class UpsertPrintPressQuotationLineDto {
  @IsString()
  @Length(1, 500)
  description!: string;

  @IsString()
  quantity!: string;

  @IsString()
  unitPrice!: string;
}

export class ListPrintPressInvoicesQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(Object.values(PrintPressInvoiceStatus))
  status?: PrintPressInvoiceStatus;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class CreatePrintPressInvoiceDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  discount?: string;

  @IsOptional()
  @IsString()
  tax?: string;

  @IsOptional()
  @IsString()
  dueAt?: string;
}

export class UpdatePrintPressInvoiceDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  discount?: string;

  @IsOptional()
  @IsString()
  tax?: string;

  @IsOptional()
  @IsString()
  dueAt?: string;
}

export class UpsertPrintPressInvoiceLineDto {
  @IsString()
  @Length(1, 500)
  description!: string;

  @IsString()
  quantity!: string;

  @IsString()
  unitPrice!: string;
}

export class CreatePrintPressInvoicePaymentDto {
  @IsString()
  method!: string;

  @IsString()
  amount!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdatePrintPressInvoicePaymentDto {
  @IsString()
  method!: string;

  @IsString()
  amount!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdatePrintPressSettingsDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  businessName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  logoFileId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  address?: string;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  email?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  taxNumber?: string;

  @IsOptional()
  @IsString()
  @Length(1, 10)
  defaultCurrencyCode?: string;
}

export class ListPrintPressExpensesQueryDto {
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
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class UpsertPrintPressExpenseDto {
  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsString()
  category!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  amount!: string;

  @IsOptional()
  @IsString()
  expenseDate?: string;
}

export class UpsertPrintPressRecurringExpenseDto {
  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsString()
  category!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  amount!: string;

  @IsIn(["weekly", "monthly", "yearly"])
  interval!: "weekly" | "monthly" | "yearly";

  @IsOptional()
  @IsString()
  nextRunAt?: string;

  @IsOptional()
  @IsIn(["true", "false"])
  isActive?: "true" | "false";
}

export class UpsertPrintPressSupplierDto {
  @IsString()
  @Length(2, 160)
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class ListPrintPressIncomeQueryDto {
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
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class UpsertPrintPressIncomeDto {
  @IsString()
  category!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  amount!: string;

  @IsOptional()
  @IsString()
  incomeDate?: string;
}
