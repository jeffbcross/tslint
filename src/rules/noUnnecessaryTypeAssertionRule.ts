/**
 * @license
 * Copyright 2016 Palantir Technologies, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { isObjectFlagSet, isObjectType, isTypeFlagSet } from "tsutils";
import * as ts from "typescript";
import * as Lint from "../index";

export class Rule extends Lint.Rules.TypedRule {
    /* tslint:disable:object-literal-sort-keys */
    public static metadata: Lint.IRuleMetadata = {
        ruleName: "no-unnecessary-type-assertion",
        description: "Warns if a type assertion does not change the type of an expression.",
        options: null,
        optionsDescription: "Not configurable",
        type: "typescript",
        hasFix: true,
        typescriptOnly: true,
        requiresTypeInfo: true,
    };
    /* tslint:enable:object-literal-sort-keys */

    public static FAILURE_STRING = "This assertion is unnecessary since it does not change the type of the expression.";

    public applyWithProgram(sourceFile: ts.SourceFile, program: ts.Program): Lint.RuleFailure[] {
        return this.applyWithWalker(new Walker(sourceFile, this.ruleName, program.getTypeChecker()));
    }
}

class Walker extends Lint.AbstractWalker<void> {
    constructor(sourceFile: ts.SourceFile, ruleName: string, private readonly checker: ts.TypeChecker) {
        super(sourceFile, ruleName, undefined);
    }

    public walk(sourceFile: ts.SourceFile) {
        const cb = (node: ts.Node): void => {
            switch (node.kind) {
                case ts.SyntaxKind.TypeAssertionExpression:
                case ts.SyntaxKind.NonNullExpression:
                case ts.SyntaxKind.AsExpression:
                    this.verifyCast(node as ts.TypeAssertion | ts.NonNullExpression | ts.AsExpression);
            }

            return ts.forEachChild(node, cb);
        };

        return ts.forEachChild(sourceFile, cb);
    }

    private verifyCast(node: ts.TypeAssertion | ts.NonNullExpression | ts.AsExpression) {
        const castType = this.checker.getTypeAtLocation(node);
        if (castType === undefined) {
            return;
        }

        if (node.kind !== ts.SyntaxKind.NonNullExpression &&
            (isTypeFlagSet(castType, ts.TypeFlags.Literal) ||
                isObjectType(castType) &&
                isObjectFlagSet(castType, ts.ObjectFlags.Tuple)) ||
            // Sometimes tuple types don't have ObjectFlags.Tuple set, like when
            // they're being matched against an inferred type. So, in addition,
            // check if any properties are numbers, which implies that this is
            // likely a tuple type.
            (castType.getProperties().some((symbol) => !isNaN(Number(symbol.name))))) {

            // It's not always safe to remove a cast to a literal type or tuple
            // type, as those types are sometimes widened without the cast.
            return;
        }

        const uncastType = this.checker.getTypeAtLocation(node.expression);
        if (uncastType === castType) {
            this.addFailureAtNode(node, Rule.FAILURE_STRING, node.kind === ts.SyntaxKind.TypeAssertionExpression
                ? Lint.Replacement.deleteFromTo(node.getStart(), node.expression.getStart())
                : Lint.Replacement.deleteFromTo(node.expression.getEnd(), node.getEnd()));
        }
    }
}
