export default function ExpenseTable({ expenses, onEdit, onDelete }) {
  return (
    <section className="expense-table">
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Category</th>
            <th>Amount</th>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((expense) => (
            <tr key={expense.expenseid}>
              <td>{expense.description}</td>
              <td>{expense.category}</td>
              <td>₱{Number(expense.amount).toFixed(2)}</td>
              <td>
                {expense.expensedate ||
                 expense.expense_date ||
                 expense.expenseDate ||
                 expense.date ||
                 expense.created_at}
              </td>
              <td>
                <button onClick={() => onEdit(expense)}>Edit</button>
                <button onClick={() => onDelete(expense.expenseid)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
