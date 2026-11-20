// Browser-preview stand-in: an empty database.
const db = {
  execAsync: async () => {}, runAsync: async () => ({ lastInsertRowId: 0, changes: 0 }),
  getAllAsync: async () => [], getFirstAsync: async () => null, closeAsync: async () => {},
};
export const openDatabaseAsync = async () => db;
export const deleteDatabaseAsync = async () => {};
export type SQLiteDatabase = typeof db;
