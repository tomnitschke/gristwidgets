# Autoaction Widget for Grist

This is a [Grist](https://www.getgrist.com) widget that allows you to run custom "user actions" every time your Grist page gets reloaded or a new record gets selected.
In other words, it's like an [action button](https://github.com/gristlabs/grist-widget/tree/master/actionbutton) that clicks itself! It should come in handy when you
absolutely need something to happen _whenever_ people load up the page. For example, you could have a “current time” column that updates as soon as the page reloads.
Or you could throw some switch (meaning a toggle column) each time, to trigger other stuff.  
**The possibilities are endless but you really need to be careful what you’re
doing. Obviously it’s easy to screw up your entire document with this.**

To use this, insert a custom widget into your Grist page and set its URL to `https://tomnitschke.github.io/gristwidgets/autoaction`.  
Then you can map the following columns:
* Actions - "Any" type column that defines what actions to run. See below for details.
* Enabled? - "Bool" type column that acts as a safety switch. If its value is not True, the widget won't do anything.
* Delay (optional) - "Integer" type column that sets a delay (in milliseconds) after which to run the actions. The delay timer starts once the record gets selected. The default is 0.
* Repetitions (optional) - "Integer" column defining how often to execute actions for the current record. Set to -1 to allow unlimited repetition. The default is 1. Note: Reloading the page resets the counter.
* Repetition Interval (optional) - "Integer" column providing the interval (in milliseconds) at which actions are repeatedly run. Obviously, this has no effect if 'Repetitions' is set to 1. The default is 1000.
* Run Backgrounded? - "Bool" type column indicating whether to allow action runs on records that aren't currently selected. When True, any records other than the current one may continue to have their actions run, but do note that in order for them to _start_ doing so, the user will have to select them at least once. The default value is False, so that actions are only ever run on the current record.

## How to define user actions
Your "Actions" column must return a _list of lists_. This means it must be a formula column set to the "Any" type, or it won't work.
Here's what the format generally looks like:
```
return [
  # The 'UpdateRecord' action takes the parameters: 'table_name' (str), 'record_id' (int), 'data' (dict, like { 'column_name': 'value_to_update_to' })
  [ "UpdateRecord", "TableName", 1, { "my_column": "the_value_to_update_to" } ],

  # 'AddRecord' is similar, but instead of a record id we pass 'None'
  [ "AddRecord", "TableName", None, { "my_column": "the_value_to_put_into_the_new_record" } ],

  # Nota bene: When updating columns of type ReferenceList, you need to pass a list of referenced record IDs *as a string representation*.
  # Thanks to user gareth1 for finding out: https://community.getgrist.com/t/how-to-copy-reference-list-using-action-button/4777/2
  # The two lines below illustrate how to deal with such cases. The first version uses a hard-coded string representation of a list
  # - note how the list with referenced IDs 1, 22, and 17 is in quotes -, while the second version uses an actual list and converts
  # that to a string representation by using repr()
  [ "UpdateRecord", "TableName", 1337, { "my_tricky_reference_list_column", "[1, 22, 17]" } ],
  [ "UpdateRecord", "TableName", 1337, { "my_tricky_reference_list_column", repr([1, 22, 17]) } ],

  # Add more actions here as you see fit.

  # For more information, see:
  # https://github.com/gristlabs/grist-core/blob/main/documentation/overview.md#changes-to-documents
  # and
  # https://github.com/gristlabs/grist-core/blob/main/sandbox/grist/useractions.py
]
```
