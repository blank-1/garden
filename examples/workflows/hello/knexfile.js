module.exports = {
  development: {
    client: "postgresql",
    connection: {
      host: "postgres",
      port: 5432,
      database: "postgres",
      user: "postgres",
      password: "test-password",
    },
    pool: {
      min: 4,
      max: 10
    },
    migrations: {
      tableName: "knex_migrations"
    }
  }
}
