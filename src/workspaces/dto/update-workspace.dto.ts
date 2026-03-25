import { Type } from 'class-transformer';
import { IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { WorkspaceBillingFieldsDto } from './workspace-billing-fields.dto';

export class UpdateWorkspaceDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkspaceBillingFieldsDto)
  billing?: WorkspaceBillingFieldsDto;
}
