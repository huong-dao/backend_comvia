export interface ListApiKeysResponseDto {
  id: string;
  name: string;
  keyPrefix?: string | null;
  status: string;
  lastUsedAt?: Date | null;
  createdAt: Date;
}
