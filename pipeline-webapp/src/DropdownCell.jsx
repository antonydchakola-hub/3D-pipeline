import React from 'react';

const DropdownCell = ({ options, value, onChange }) => {
  const displayOptions = [...options];
  if (value && !displayOptions.includes(value)) {
    displayOptions.push(value);
  }

  return (
    <div className="dropdown-cell-container">
      <select 
        className={`dropdown-select ${!value ? 'empty-select' : ''}`}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        data-value={value || ''}
      >
        <option value=""></option>
        {displayOptions.map((opt, idx) => (
          opt !== '' && <option key={idx} value={opt}>{opt}</option>
        ))}
      </select>
      <span className="dropdown-icon">▼</span>
    </div>
  );
};

export default DropdownCell;
