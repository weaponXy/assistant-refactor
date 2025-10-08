using System;
using System.Collections.Generic;
using Shared.Allowlists;

namespace Shared.Allowlists
{
    public class SqlAllowlistV2 : ISqlAllowlist
    {
        // Backing set of allowed tables
        private static readonly HashSet<string> _tables = new(StringComparer.OrdinalIgnoreCase)
        { "products", "suppliers", "productcategory" };

        // ISqlAllowlist.Tables
        public IReadOnlyCollection<string> Tables => _tables;

        public int MaxLimit => 1000;
        public int DefaultLimit => 50;

        private static readonly Dictionary<string, HashSet<string>> Columns =
            new(StringComparer.OrdinalIgnoreCase)
            {
                ["products"] = new(StringComparer.OrdinalIgnoreCase)
                { "productid","productname","description","supplierid","createdat","updatedat","image_url","updatedbyuserid" },
                ["suppliers"] = new(StringComparer.OrdinalIgnoreCase)
                { "supplierid","suppliername","contactperson","phonenumber","supplieremail","address","createdat","updatedat","supplierstatus","defectreturned" },
                ["productcategory"] = new(StringComparer.OrdinalIgnoreCase)
                { "productcategoryid","productid","price","cost","color","agesize","currentstock","reorderpoint","updatedstock" },
            };

        private static readonly HashSet<string> Operators = new(StringComparer.OrdinalIgnoreCase)
        { "=", "<", ">", "<=", ">=", "LIKE", "ILIKE" };

        public bool IsTableAllowed(string t) => _tables.Contains(t);

        public bool IsColumnAllowed(string t, string c) =>
            Columns.TryGetValue(t, out var set) && set.Contains(c);

        public bool IsOperatorAllowed(string op) => Operators.Contains(op);
    }
}
