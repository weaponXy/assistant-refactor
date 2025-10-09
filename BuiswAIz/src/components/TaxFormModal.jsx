// src/components/TaxFormModal.jsx
import React, { useMemo, useState, useEffect } from "react";
import "./style/ConfirmDeleteModal.css"; // reuse overlay/modal styles
import { calcTax } from "../lib/tax";

export default function TaxFormModal({
  show,
  onClose,
  onSave,
  initialAmount = 0,
  initialTax = null // { type, rate, is_inclusive, withholding_rate }
}) {
  if (!show) return null;

  const DEFAULT_TYPE = initialTax?.type || 'PERCENTAGE_TAX';
  const DEFAULT_RATE = typeof initialTax?.rate === 'number' ? initialTax.rate : 0.03;
  const DEFAULT_INCLUSIVE = typeof initialTax?.is_inclusive === 'boolean' ? initialTax.is_inclusive : true;
  const DEFAULT_WITHHOLD = typeof initialTax?.withholding_rate === 'number' ? initialTax.withholding_rate : 0;

  const [taxType, setTaxType] = useState(DEFAULT_TYPE);
  const [rate, setRate] = useState(DEFAULT_RATE);
  const [isInclusive, setIsInclusive] = useState(DEFAULT_INCLUSIVE);
  const [withholdingRate, setWithholdingRate] = useState(DEFAULT_WITHHOLD);
  const [amount, setAmount] = useState(Number(initialAmount) || 0);

  useEffect(() => { setAmount(Number(initialAmount) || 0); }, [initialAmount]);

  const breakdown = useMemo(() => {
    return calcTax({ amount, type: taxType, rate, isInclusive, withholdingRate });
  }, [amount, taxType, rate, isInclusive, withholdingRate]);

  function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      type: taxType,
      rate: Number(rate || 0),
      is_inclusive: !!isInclusive,
      net: Number((breakdown.net ?? 0).toFixed(2)),
      tax: Number((breakdown.tax ?? 0).toFixed(2)),
      gross: Number((breakdown.gross ?? 0).toFixed(2)),
      withholding_rate: Number(withholdingRate || 0),
      withholding: Number((breakdown.withholding ?? 0).toFixed(2)),
    };
    onSave && onSave(payload);
  }

  return (
    <div className="modal-overlay">
      <form className="modal" onSubmit={handleSubmit}>
        <h2>Tax</h2>

        <div className="field">
          <label>Amount (reference)</label>
          <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value || 0))} />
          <small>Used to preview Net/Tax/Gross live.</small>
        </div>

        <div className="field">
          <label>Type</label>
          <select value={taxType} onChange={(e) => setTaxType(e.target.value)}>
            <option value="PERCENTAGE_TAX">Percentage Tax</option>
            <option value="VAT">VAT</option>
            <option value="NONE">No Tax</option>
          </select>
        </div>

        <div className="field">
          <label>Rate</label>
          <input
            type="number"
            step="0.0001"
            placeholder={taxType === 'VAT' ? "0.12" : "0.03"}
            disabled={taxType === 'NONE'}
            value={taxType === 'NONE' ? '' : rate}
            onChange={(e) => setRate(Number(e.target.value || 0))}
          />
        </div>

        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={isInclusive}
              onChange={(e) => setIsInclusive(e.target.checked)}
            />
            {" "}Inclusive
          </label>
        </div>

        <div className="field">
          <label>Withholding (optional)</label>
          <input
            type="number"
            step="0.0001"
            placeholder="0 or 0.01"
            value={withholdingRate || ''}
            onChange={(e) => setWithholdingRate(Number(e.target.value || 0))}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 8 }}>
          <div className="preview-box">
            <div className="label">Net</div>
            <div className="value">{Number(breakdown.net || 0).toFixed(2)}</div>
          </div>
          <div className="preview-box">
            <div className="label">Tax</div>
            <div className="value">{Number(breakdown.tax || 0).toFixed(2)}</div>
          </div>
          <div className="preview-box">
            <div className="label">Gross</div>
            <div className="value">{Number(breakdown.gross || 0).toFixed(2)}</div>
          </div>
        </div>

        <div className="modal-actions" style={{ marginTop: 12 }}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit">Save</button>
        </div>
      </form>
    </div>
  );
}
