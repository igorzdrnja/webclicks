// actual implementation
const sort_by = function(){
    var args = arguments;
    // utility functions
    var default_cmp = (a, b) => {
        if (a === b) return 0;
        return a < b ? -1 : 1;
    };
    var getCmpFunc = (primer, reverse) => {
        var dfc = default_cmp, // closer in scope
            cmp = default_cmp;
        if (primer) {
            cmp = function(a, b) {
                return dfc(primer(a), primer(b));
            };
        }
        if (reverse) {
            return function(a, b) {
                return -1 * cmp(a, b);
            };
        }
        return cmp;
    };

    var fields = [];
    var n_fields = args.length;
    var field = '';
    var name = '';
    var cmp = '';

    // preprocess sorting options
    for (var i = 0; i < n_fields; i++) {
        field = args[i];
        if (typeof field === 'string') {
            name = field;
            cmp = default_cmp;
        }
        else {
            name = field.name;
            cmp = getCmpFunc(field.primer, field.reverse);
        }
        fields.push({
            name: name,
            cmp: cmp
        });
    }

    // final comparison function
    return (A, B) => {
        var name, result;
        for (var i = 0; i < n_fields; i++) {
            result = 0;
            field = fields[i];
            name = field.name;

            result = field.cmp(A[name], B[name]);
            if (result !== 0) break;
        }
        return result;
    }
};

export default sort_by;