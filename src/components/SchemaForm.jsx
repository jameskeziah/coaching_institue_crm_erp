import React from 'react';

function renderInput(attribute, value, onChange) {
  const commonProps = {
    id: attribute.name,
    value: value ?? '',
    onChange: (e) => onChange(attribute.name, e.target.value),
    className: 'w-full rounded-md border px-3 py-2 text-sm',
    required: Boolean(attribute.required),
  };

  if (attribute.type === 'number') {
    return <input type="number" {...commonProps} />;
  }

  if (attribute.type === 'json') {
    return (
      <textarea
        {...commonProps}
        rows={4}
        value={value ?? ''}
        onChange={(e) => onChange(attribute.name, e.target.value)}
      />
    );
  }

  if (attribute.type === 'datetime') {
    return <input type="datetime-local" {...commonProps} />;
  }

  return <input type="text" {...commonProps} />;
}

export default function SchemaForm({ schema, formData, onChange, onSubmit, submitLabel = 'Create', exclude = [], errors = {} }) {
  if (!schema) {
    return <div>Loading schema…</div>;
  }

  const visibleAttributes = schema.attributes.filter((attr) => !exclude.includes(attr.name));

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-3 md:grid-cols-2">
        {visibleAttributes.map((attribute) => (
          <label key={attribute.name} htmlFor={attribute.name} className="space-y-2 text-sm">
            <span className="block font-medium text-slate-700">{attribute.label || attribute.name}</span>
            {renderInput(attribute, formData[attribute.name], onChange)}
            {errors[attribute.name] ? <span className="block text-xs font-medium text-rose-700">{errors[attribute.name]}</span> : null}
          </label>
        ))}
      </div>

      <div className="mt-4">
        <button type="submit" className="rounded-md bg-emerald-600 px-4 py-2 text-white">{submitLabel}</button>
      </div>
    </form>
  );
}
