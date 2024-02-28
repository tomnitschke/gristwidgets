# Grist docxtemplater widget
_Based on and expanded from https://github.com/stan-donarise/grist-docxtemplater-widget. Thanks, Stan!_

This integrates [docxtemplater](https://docxtemplater.com/) with [Grist](https://www.getgrist.com/).  
Use it in your Grist documents by adding a custom widget and setting its URL to: `https://tomnitschke.github.io/gristwidgets/docxtemplater/`

Once set up as a custom widget, it expects the following columns to be mapped:
* "Attachment ID": Int column giving the id of a Grist attachment record. This should point to the template DOCX document. The ID can be obtained within Grist by using a formula like this: `$TheAttachmentColumn.id[0]` (Note the `[0]` to use only the first attachment, should there be multiple. The widget can only handle one file at a time.)
* "Placeholder Data": Any-type column (note it _must_ be set to type "Any", not just to _any_ type!) holding a dictionary like this: `{placeholderName: valueToReplaceBy}`. Docxtemplater will replace any occurences of `placeholderName` in the template DOCX document with the respective `valueToReplaceBy`. See below for an example of how to create such a dictionary from your Grist record.
* "Output File Name": Text column giving the name for the resulting file that will be offered for download once docxtemplater is done processing. This should include the ".docx" extension.

The following columns may be mapped optionally:
* "Use Angular Parser?": Bool column determining whether to enable the [Angular parser](https://docxtemplater.com/docs/angular-parse/) for advanced placeholder expressions or not. The default is True.
* "Custom Delimiter: Start": Text column defining the starting/opening delimiter for placeholders. The default is `{`. (Note that if this is mapped but empty, the default will be used.)
* "Custom Delimiter: End": Text column defining the ending/closing delimiter for placeholders. The default is `}`. (Note that if this is mapped but empty, the default will be used.)

Additional notes:
* Any placeholders in the template document that aren't in the "Placeholder Data" dictionary (see above) won't be touched and will appear unchanged in the document.
* Placeholders that are known but for which the current value is 'None' will be replaced by nothing in the document.


## Creating a placeholder-to-value mapping from a Grist record
Here's an example implementation on how to create a placeholder-to-value mapping for a given Grist record.  
First off, make a formula column "helper" and copy all of this into it:
```python
import grist
import json
from column import BaseColumn
from table import Table
from docmodel import global_docmodel as gdm

def get_column_meta(table: str, column: str) -> grist.Record or None:
  """
    Helper function to get a column's meta record.
    This shouldn't create any dependencies, so it won't get re-evaluated if said meta record changes.
  """
  if column == "id":
    return {}
  try:
    # Note we don't use lookupOne() because that would create dependencies.
    # In case of an empty grist.Record, just return None.
    return _grist_Tables_column.table.get_record(_grist_Tables_column.table.get(tableId=table, colId=column)) or None
  except:
    return None

def get_column_options(table: str, column: str) -> dict:
  """
    Helper function to get the 'widgetOptions' dict for a column.
    Note: Grist stores these options as a JSON string. If for some reason this can't be parsed,
    this function will return an empty dict. It will *not* raise an error.
  """
  meta = get_column_meta(table, column)
  if not meta or not hasattr(meta, "widgetOptions"):
    # If there is no meta, chances are this simply isn't a valid column.
    # For ease of use, we don't raise an error here but simply return an empty dict.
    # The same goes for columns whose meta inexplicably lacks a "widgetOptions" field, though afaik
    # this should never happen anyway.
    return {}
  try:
    return json.loads(meta.widgetOptions)
  except:
    return {}

def get_table_object(table: str) -> Table or None:
  """
    Helper function to get an instance of the table.Table object for this table.
    Note that this *won't* raise an error if the table can't be found, but will simply return None.
  """
  try:
    return gdm.get_table(table).table
  except:
    return None

def get_column_object(table: str, column: str) -> BaseColumn or None:
  """
    Helper function to get an instance of the column.BaseColumn object for the given 'column' of the given 'table'.
    Note that this *won't* raise an error if the column (or table) can't be found, but will simply return None.
  """
  table_obj = get_table_object(table)
  if not table_obj:
    return None
  try:
    return table_obj.get_column(column)
  except:
    return None

def get_column_type(table: str, column: str) -> str or None:
  """
    Helper function to get the column type.
    Returns a Grist type name as a string (for reference, see https://support.getgrist.com/widget-custom/#column-mapping).
  """
  col_obj = get_column_object(table, column)
  if not col_obj or not hasattr(col_obj, "type_obj"):
    # If there is no column object, chances are this simply isn't a valid column.
    # For ease of use, we don't raise an error here but simply return None.
    # As a precaution, do the same in case the column object lacks a "type_obj" attribute.
    return None
  return col_obj.type_obj.typename()

def create_placeholder_mapping(record: grist.Record, disable_nested_placeholders: bool=False) -> dict:
  """
    Creates a placeholder-to-value mapping of the form '{placeholderName: valueToReplaceBy}' for the given record.
    Values will all be returned as string or None; this is safe for use with the docxtemplater widget.
    If possible, values will be formatted nicely according to the respective column settings in Grist.
    If the record contains reference columns, these will be expanded to (one level deep) nested placeholders, such
    that a column referencing a record of "RefedTable" will result in placeholders like these getting generated
    (according to the columns of "RefedTable"): 'RefedTable.A', 'RefedTable.B', ...
  """
  mapping = {}
  # Get all columns of this record's table.
  columns = [col for col in record._table.all_columns.keys() if not col.startswith((
    # Columns whose name begins (or is) as follows will be ignored.
    "#",
    "id",
    "gristHelper_",
    "manualSort"
  ))]
  for col in columns:
    try:
      try:
        # Get this column's value for the current record, or default to an empty string in case of an error.
        # Note: If the record includes a reference column that points to the table we're currently running
        # this formula from, we'll get a CircularRefError unless we use PEEK() here.
        # Using PEEK() means that this whole formula won't get re-evaluated when 'record' gets updated; you'd
        # have to trigger that by some other means.
        val = PEEK(getattr(record, col))
      except AttributeError:
        val = ""
      # Create the mapping for this column using the raw value just obtained. We will apply additional
      # formatting to the value below if possible.
      mapping[col] = val
      if type(val) in (str, int, float, bool, list, tuple, datetime.datetime, datetime.date):
        # For column types we can handle, format the value accordingly.
        mapping[col] = format_value(record._table.table_id, col, val)
        continue
      if isinstance(val, (grist.Record, grist.RecordSet)):
        # For reference columns, create nested placeholders (like this: {column_name.referenced_column_name: referenced_column_value})
        # The reference column itself gets a placeholder that just uses repr().
        mapping[col] = repr(val)
        # If so requested, don't create nested placeholders.
        if disable_nested_placeholders:
          continue
        column_type = get_column_type(record._table.table_id, col)
        if not column_type or not column_type.startswith("Ref"):
          # If this isn't actually a reference column (it could be an "Any" type column just happening to hold records),
          # we won't create any nested placeholders.
          continue
        try:
          referenced_table = get_column_object(record._table.table_id, col).type_obj.table_id
          referenced_table_obj = get_table_object(referenced_table)
          if not referenced_table_obj:
            # If this reference column points to a table that can't be found, we can't create any nested placeholders.
            continue
          #referenced_record = referenced_table_obj.user_table.lookupOne(id=val.id if isinstance(val, grist.Record) else val.id[0])
          referenced_record = referenced_table_obj.get_record(referenced_table_obj.get(id=val.id if isinstance(val, grist.Record) else val.id[0]))
          # Create nested placeholders, but not nested-nested placeholders. We can't do this easily because
          # the referenced record that we're creating nested placeholders for might include a reference column
          # pointing back to the table we're running this formula from - we'd end up with a RecursionError.
          nested_mapping = create_placeholder_mapping(referenced_record, disable_nested_placeholders=True)
          for k, v in nested_mapping.items():
            mapping[f"{col}.{k}"] = v
        except:
          # If something went wrong trying to create nested placeholders, then we'll just leave it.
          continue
    except:
      # Any uncaught errors shouldn't crash the function. We simply return an empty placeholder in that case.
      # Feel free to 'raise' instead to see what went wrong.
      mapping[col] = ""
  return mapping

def _format_as_decimal(v: object, num_decimals: int, decimals_separator: str, thousands_separator: str) -> str:
  v = v or 0
  try:
    v = float(v)
  except:
    return v
  return f"{v:_.{num_decimals}f}".replace(".", decimals_separator).replace("_", thousands_separator)

def _format_as_datetime(val: datetime.datetime, include_seconds: bool=True, formatstring: str=None) -> str:
  if formatstring is None:
    formatstring = "%d.%m.%Y %H:%M" + (":%S" if include_seconds else "")
  try:
    return val.strftime(formatstring)
  except:
    return val

def _format_as_date(val: datetime.date or datetime.datetime, include_day: bool=True, formatstring: str=None) -> str:
  if formatstring is None:
    formatstring = ("%d." if include_day else "") + "%m" + ("." if include_day else "/") + "%Y"
  try:
    return val.strftime(formatstring)
  except:
    return val

def format_value(table: str, column: str, val: object, decimals_separator: str=".", thousands_separator: str=",", default_num_decimals: int=2, bool_representation: tuple=("No", "Yes"), list_concatenator: str=", ", currency_symbol: str="$ ", currency_prefixed: bool=True, percent_symbol: str=" %") -> str:
  """
    Formats a value 'val' according to Grist's column settings for 'column' of 'table'.
    Other arguments should be pretty self-explanatory.
  """
  def doFormat(v: object) -> str:
    try:
      col_opts = get_column_options(table, column)
      col_type = get_column_type(table, column)
      if not col_type:
        return repr(val)
      if col_type in ("Int", "Numeric") and "numMode" in col_opts:
        decimals = max(default_num_decimals, col_opts.get("decimals", 0))
        decimals = max(decimals, col_opts.get("maxDecimals", 0))
        if col_opts["numMode"] == "currency":
          formatted_value = _format_as_decimal(v, num_decimals=decimals, decimals_separator=decimals_separator, thousands_separator=thousands_separator)
          # Note: We could use col_opts["currency"] to determine the currency symbol rather than rely on a separate argument.
          # But that field holds a currency code like "USD" or "EUR" rather than the symbol itself, so since Grist unfortunately doesn't give us
          # access to the 'babel' module, we'd need to mess around with locales instead, or use a huge lookup dictionary. That seems
          # hugely out of scope here.
          formatted_value = (currency_symbol if currency_prefixed else "") + formatted_value + (currency_symbol if not currency_prefixed else "")
          return formatted_value
        if col_opts["numMode"] == "percent":
          return _format_as_decimal(v, num_decimals=decimals, decimals_separator=decimals_separator, thousands_separator=thousands_separator) + percent_symbol
        if col_opts["numMode"] == "decimal":
          return _format_as_decimal(v, num_decimals=decimals, decimals_separator=decimals_separator, thousands_separator=thousands_separator)
        return str(v)
      if col_type in ("Date", "DateTime") and "dateFormat" in col_opts:
        # Note the following doesn't support Date/DateTime fields that are set up to use the "name of week day" format.
        formatstring = col_opts["dateFormat"].replace("DD", "%d").replace("MM", "%m").replace("YYYY", "%Y")
        if "timeFormat" in col_opts and col_type == "DateTime":
          formatstring2 = col_opts["timeFormat"].replace("HH", "%H").replace("mm", "%M").replace("ss", "%S")
          try:
            return _format_as_datetime(val, formatstring=formatstring + " " + formatstring2)
          except:
            return _format_as_datetime(val)
        try:
          return _format_as_date(val, formatstring=formatstring)
        except:
          return _format_as_date(val)
      if col_type == "Bool":
        return bool_representation[int(bool(val))]
      return str(v)
    except:
      return repr(v)

  if isinstance(val, (list, tuple)):
    result = []
    for v in val:
      result.append(doFormat(v))
    return list_concatenator.join(result)
  return doFormat(val)



# Small helper to enable accessing the functions above using '$ThisCol.function_name' syntax.
class Export:
  def __init__(self, locals):
    self.locals = locals
  def __getattr__(self, key):
    return self.locals[key]
return Export(locals())
```

Now make another formula column "placeholder_mapping" and put this inside:
```
# To make a placeholder mapping for this record itself, do 'record = rec' instead.
record = SomeTable.lookupOne()
# Create the mapping and return it.
return $helper.create_placeholder_mapping(record)
```
You can now map the column "placeholder_mapping" as the "Placeholder Data" column for docxtemplater.