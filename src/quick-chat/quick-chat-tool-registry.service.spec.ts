import { QuickChatToolRegistryService } from './quick-chat-tool-registry.service';

describe('QuickChatToolRegistryService financial entities', () => {
  const registry = new QuickChatToolRegistryService();

  it.each(['Order', 'OrderItem', 'Invoice', 'InvoiceItem'])(
    'does not grant STAFF access to %s',
    (entity) => {
      const config = registry.resolve(`${entity}.queryAll`)?.config;

      expect(config?.readRoles).not.toContain('STAFF');
      expect(config?.writeRoles).not.toContain('STAFF');
    },
  );
});
