export function buildInitialForm(schema, exclude = []) {
  if (!schema?.attributes) return {};
  return schema.attributes.reduce((acc, attribute) => {
    if (exclude.includes(attribute.name)) return acc;
    if (attribute.type === 'json') {
      acc[attribute.name] = '';
    } else if (attribute.type === 'number') {
      acc[attribute.name] = '';
    } else {
      acc[attribute.name] = '';
    }
    return acc;
  }, {});
}

export function preparePayload(schema, formData, exclude = []) {
  if (!schema?.attributes) return {};
  return schema.attributes.reduce((acc, attribute) => {
    if (exclude.includes(attribute.name)) return acc;
    let value = formData[attribute.name];

    if (attribute.type === 'number') {
      if (value === '' || value === undefined || value === null) {
        value = null;
      } else {
        value = Number(value);
      }
    }

    if (attribute.type === 'json') {
      if (typeof value === 'string') {
        try {
          value = value.trim() ? JSON.parse(value) : {};
        } catch {
          value = value;
        }
      }
    }

    if (value !== undefined) {
      acc[attribute.name] = value;
    }
    return acc;
  }, {});
}
