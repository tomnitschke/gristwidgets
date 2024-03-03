# Autoaction Widget for Grist

This is a [Grist](https://www.getgrist.com) widget that allows you to run custom "user actions" every time your Grist page gets reloaded or a new record gets selected.
In other words, it's like an [action button](https://github.com/gristlabs/grist-widget/tree/master/actionbutton) that clicks itself! It should come in handy when you
absolutely need something to happen _whenever_ people load up the page. For example, you could have a “current time” column that updates as soon as the page reloads.
Or you could throw some switch (meaning a toggle column) each time, to trigger other stuff.  
**The possibilities are endless but you really need to be careful what you’re
doing. Obviously it’s easy to screw up your entire document with this.**

To use this, insert a custom widget into your Grist page and set its URL to `https://tomnitschke.github.io/gristwidgets/autoaction`.  
You'll then have to map two columns:
* Actions - "Any" type column that defines what actions to run. See below for details.
* Enabled? - "Bool" type column that acts as a safety switch. If its value is not True, the widget won't do anything.

## How to define user actions
You "Actions" column must return a _list of lists_. This means it must be a formula column set to the "Any" type, or it won't work.
Here's what the format generally looks like:
```
return [
  # The 'UpdateRecord' action takes the parameters: 'table_name' (str), 'record_id' (int), 'data' (dict, like { 'column_name': 'value_to_update_to' })
  [ "UpdateRecord", "TableName", 1, { "my_column": "the_value_to_update_to" } ],

  # 'AddRecord' is similar, but instead of a record id we pass 'None'
  [ "AddRecord", "TableName", None, { "my_column": "the_value_to_put_into_the_new_record" } ],

  # Add more actions here as you see fit.

  # For more information, see:
  # https://github.com/gristlabs/grist-core/blob/main/documentation/overview.md#changes-to-documents
  # and
  # https://github.com/gristlabs/grist-core/blob/main/sandbox/grist/useractions.py
]
```
