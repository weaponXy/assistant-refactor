export default function ExpenseFormModal({ show, onClose, onSave, expenseData, setExpenseData, isEdit }) {
  if (!show) return null;
  return (
    <div className="modal-overlay">
      <form className="modal" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
        <h2>{isEdit ? "Edit Expense" : "Add Expense"}</h2>
        <input placeholder="Description" value={expenseData.description} onChange={(e) => setExpenseData({ ...expenseData, description: e.target.value })} />
        <input placeholder="Category" value={expenseData.category} onChange={(e) => setExpenseData({ ...expenseData, category: e.target.value })} />
        <input type="number" placeholder="Amount" value={expenseData.amount} onChange={(e) => setExpenseData({ ...expenseData, amount: e.target.value })} />
        <input type="date" value={expenseData.date} onChange={(e) => setExpenseData({ ...expenseData, date: e.target.value })} />
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit">{isEdit ? "Update" : "Add"}</button>
        </div>
      </form>
    </div>
  );
}
