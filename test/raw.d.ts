/** SQL マイグレーションを Vitest の raw 文字列として読み込むための型宣言。 */
declare module "*.sql?raw" {
  const source: string;
  export default source;
}
